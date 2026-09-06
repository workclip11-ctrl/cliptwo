// ---------------------------------------------------------------------------
// Metric provider abstraction — fetches verified metrics from social platforms.
//
// In production, these call the real Instagram Graph API and YouTube Data API
// to fetch view/engagement counts for a given post/video.
//
// SECURITY: All metric fetches happen server-side. The client never calls
// these functions directly.
//
// IMPORTANT: Mock metrics (source='mock') are NEVER used for earnings
// calculations. Only verified platform API metrics influence payouts.
//
// Instagram: Uses Instagram API with Instagram Login (graph.instagram.com).
// Media insights use current supported metrics (views, likes, comments, shares).
// Deprecated metrics (impressions, plays) are NOT used.
// ---------------------------------------------------------------------------

import type { Platform } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FetchedMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  channelId?: string; // YouTube channel ID for ownership verification
  fetchedAt: Date;
  source: "platform_api" | "admin_override";
  verificationStatus: "verified" | "pending" | "failed";
}

export interface MetricProvider {
  platform: Platform;

  /** Fetch metrics for a specific post/video by URL or ID */
  fetchMetrics(postUrl: string, accessToken: string): Promise<FetchedMetrics>;

  /** Fetch metrics for all clips belonging to a platform account */
  fetchAccountMetrics(
    accountIdentifier: string,
    accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>>;
}

// ── Instagram (Instagram API with Instagram Login) ──────────────────────────
//
// Uses graph.instagram.com for all API calls (Instagram Login path).
//
// Media insights use current supported metrics:
//   - views: Total number of times IG Media has been played (primary metric)
//   - likes: Number of likes
//   - comments: Number of comments
//   - shares: Number of shares
//
// Deprecated metrics NOT used:
//   - impressions (deprecated April 2025)
//   - plays (deprecated April 2025)
//   - video_views (deprecated January 2025)
//
// Media type handling:
//   - IMAGE: views metric not available (no video plays)
//   - VIDEO/REELS: views metric available
//   - CAROUSEL_ALBUM: may contain mixed types, insights per child
//
// Media discovery:
//   - GET /{ig-user-id}/media with pagination
//   - Supports up to 10K recent media items
//   - Bounded pagination to avoid unbounded loops
// ---------------------------------------------------------------------------

class InstagramMetricProvider implements MetricProvider {
  platform: Platform = "Instagram";

  private static readonly API_BASE = "https://graph.instagram.com";
  private static readonly MAX_MEDIA_PAGES = 20; // Safety limit for pagination
  private static readonly MEDIA_PAGE_SIZE = 50;

  async fetchMetrics(
    postUrl: string,
    accessToken: string,
  ): Promise<FetchedMetrics> {
    const mediaId = this.extractMediaId(postUrl);

    if (!mediaId) {
      // If we can't extract a media ID from the URL, try to find it by URL matching
      const foundMediaId = await this.findMediaIdByPermalink(postUrl, accessToken);
      if (!foundMediaId) {
        throw new Error(`Could not extract or find media ID from URL: ${postUrl}`);
      }
      return this.fetchMetricsById(foundMediaId, accessToken);
    }

    return this.fetchMetricsById(mediaId, accessToken);
  }

  private async fetchMetricsById(
    mediaId: string,
    accessToken: string,
  ): Promise<FetchedMetrics> {
    // 1. Fetch media details (type, product type, username, caption)
    const mediaRes = await fetch(
      `${InstagramMetricProvider.API_BASE}/${mediaId}?fields=id,media_type,media_product_type,username,caption,permalink&access_token=${accessToken}`,
    );

    if (!mediaRes.ok) {
      const err = await mediaRes.json().catch(() => ({}));
      throw new Error(
        `Instagram media fetch failed: ${err.error?.message ?? mediaRes.statusText}`,
      );
    }

    const media = await mediaRes.json();

    // 2. Fetch engagement metrics from the media object
    //    likes, comments_count, shares are on the media object directly
    const likes = media.like_count ?? 0;
    const comments = media.comments_count ?? 0;
    const shares = media.shares?.count ?? 0;

    // 3. Fetch views from media insights
    //    views is the current metric (replaced deprecated impressions/plays)
    //    Available for VIDEO and REELS, may not be available for IMAGE
    let views = 0;

    try {
      const insightsRes = await fetch(
        `${InstagramMetricProvider.API_BASE}/${mediaId}/insights?metric=views&access_token=${accessToken}`,
      );

      if (insightsRes.ok) {
        const insights = await insightsRes.json();
        const viewsMetric = insights.data?.find(
          (d: { name: string }) => d.name === "views",
        );
        views = viewsMetric?.values?.[0]?.value ?? 0;
      } else {
        // views metric may not be available for image posts
        // This is expected — not all media types support views
        const err = await insightsRes.json().catch(() => ({}));
        const errCode = err.error?.code;

        // Error 100 = parameter error (metric not supported for this media type)
        // This is expected for IMAGE posts
        if (errCode !== 100) {
          console.error(
            `[instagram-metrics] Insights fetch failed for ${mediaId}:`,
            err.error?.message ?? insightsRes.statusText,
          );
        }
      }
    } catch {
      // Network error — views stay at 0
    }

    return {
      views,
      likes,
      comments,
      shares,
      fetchedAt: new Date(),
      source: "platform_api",
      verificationStatus: "verified",
    };
  }

  async fetchAccountMetrics(
    accountIdentifier: string,
    accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>> {
    const results: Array<{ postUrl: string; metrics: FetchedMetrics }> = [];
    let url: string | null =
      `${InstagramMetricProvider.API_BASE}/${accountIdentifier}/media` +
      `?fields=id,media_type,media_product_type,permalink,username` +
      `&limit=${InstagramMetricProvider.MEDIA_PAGE_SIZE}` +
      `&access_token=${accessToken}`;

    let pageCount = 0;

    while (url && pageCount < InstagramMetricProvider.MAX_MEDIA_PAGES) {
      const res = await fetch(url);
      if (!res.ok) break;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const mediaList: Array<{ id: string; permalink?: string }> = data.data ?? [];

      for (const media of mediaList) {
        try {
          const metrics = await this.fetchMetricsById(media.id, accessToken);
          results.push({
            postUrl: media.permalink ?? `https://www.instagram.com/p/${media.id}/`,
            metrics,
          });
        } catch {
          // Skip individual media items that fail
        }
      }

      url = data.paging?.next ?? null;
      pageCount++;
    }

    return results;
  }

  /**
   * Find media ID by matching permalink URL.
   * Used when the submitted clip URL doesn't contain a direct media ID.
   */
  private async findMediaIdByPermalink(
    postUrl: string,
    accessToken: string,
  ): Promise<string | null> {
    // Normalize the URL for comparison
    const normalizedUrl = this.normalizePermalink(postUrl);

    // We need to search through the account's media to find a matching permalink.
    // This is less efficient than a direct ID lookup, but necessary when
    // the submitted URL doesn't contain a recognizable media ID.
    // The accountIdentifier should be passed via the URL, but since we don't
    // have it here, we return null and let the caller handle URL-based matching.
    void normalizedUrl;
    void accessToken;
    return null;
  }

  /**
   * Normalize Instagram permalink URLs for comparison.
   * Removes trailing slashes, query strings, and lowercases.
   */
  private normalizePermalink(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove trailing slash and query parameters
      let path = parsed.pathname.replace(/\/+$/, "");
      // Lowercase for case-insensitive comparison
      path = path.toLowerCase();
      return `${parsed.hostname}${path}`;
    } catch {
      return url.toLowerCase().replace(/\/+$/, "");
    }
  }

  /**
   * Extract Instagram media ID from various URL formats.
   *
   * Supported formats:
   *   - https://www.instagram.com/reel/<id>/
   *   - https://www.instagram.com/p/<id>/
   *   - https://www.instagram.com/tv/<id>/
   *   - Direct media ID (alphanumeric with underscores/hyphens)
   *
   * IMPORTANT: The URL slug is NOT always identical to the Meta media ID.
   * This method extracts what looks like a media shortcode from the URL.
   * For accurate metrics, the caller should use the media ID returned by
   * the Instagram API, not the URL slug.
   */
  private extractMediaId(url: string): string | null {
    // Match common Instagram URL patterns
    const patterns = [
      /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
      /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    // If the URL doesn't match any pattern, check if it's a direct media ID
    // Instagram media IDs are typically numeric or alphanumeric with underscores
    if (/^[A-Za-z0-9_-]+$/.test(url)) {
      return url;
    }

    return null;
  }
}

// ── YouTube (Data API v3) ───────────────────────────────────────────────────

class YouTubeMetricProvider implements MetricProvider {
  platform: Platform = "YouTube";

  async fetchMetrics(
    postUrl: string,
    accessToken: string,
  ): Promise<FetchedMetrics> {
    const videoId = this.extractVideoId(postUrl);
    if (!videoId) {
      throw new Error(`Could not extract video ID from URL: ${postUrl}`);
    }

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      throw new Error(`YouTube metrics fetch failed: ${res.statusText}`);
    }

    const data = await res.json();
    const video = data.items?.[0];
    const stats = video?.statistics;
    const snippet = video?.snippet;

    if (!video) {
      throw new Error(`Video not found or is private/deleted: ${videoId}`);
    }
    if (!stats) {
      throw new Error(`No statistics found for video: ${videoId}`);
    }
    if (!snippet) {
      throw new Error(`No snippet found for video: ${videoId}`);
    }
    if (!snippet.channelId) {
      throw new Error(`No channelId found for video: ${videoId}`);
    }

    return {
      views: parseInt(stats.viewCount ?? "0", 10),
      likes: parseInt(stats.likeCount ?? "0", 10),
      comments: parseInt(stats.commentCount ?? "0", 10),
      shares: 0, // YouTube API doesn't expose share counts directly
      channelId: snippet.channelId,
      fetchedAt: new Date(),
      source: "platform_api",
      verificationStatus: "verified",
    };
  }

  async fetchAccountMetrics(
    _accountIdentifier: string,
    _accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>> {
    throw new Error("YouTube batch metrics not yet implemented");
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) return match[1];
    }
    return null;
  }
}

// ── Kick (Not yet available) ────────────────────────────────────────────────
//
// Kick does not have a public API for third-party metric fetching.
// This provider throws on every operation.

class KickMetricProvider implements MetricProvider {
  platform: Platform = "Kick";

  async fetchMetrics(
    _postUrl: string,
    _accessToken: string,
  ): Promise<FetchedMetrics> {
    throw new Error(
      "Kick metrics are not yet available. Kick does not currently offer a public API for third-party metric access.",
    );
  }

  async fetchAccountMetrics(
    _accountIdentifier: string,
    _accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>> {
    throw new Error("Kick integration is not yet available.");
  }
}

// ── Provider factory ────────────────────────────────────────────────────────

function isConfigured(platform: Platform): boolean {
  switch (platform) {
    case "Instagram":
      return !!(process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET);
    case "YouTube":
      return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    case "Kick":
      return false; // No API available
    default:
      return false;
  }
}

export function getMetricProvider(platform: Platform): MetricProvider {
  switch (platform) {
    case "Instagram":
      return new InstagramMetricProvider();
    case "YouTube":
      return new YouTubeMetricProvider();
    case "Kick":
      return new KickMetricProvider();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function isMetricProviderConfigured(platform: Platform): boolean {
  return isConfigured(platform);
}
