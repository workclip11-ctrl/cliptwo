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
  username?: string;  // Instagram username for ownership verification
  fetchedAt: Date;
  source: "platform_api" | "admin_override";
  verificationStatus: "verified" | "pending" | "failed";
}

export interface MetricProvider {
  platform: Platform;

  /**
   * Fetch metrics for a specific post/video by URL or ID.
   * For Instagram, accountIdentifier (the IG User ID) is required to resolve
   * shortcodes to real Meta media IDs by searching the account's media library.
   */
  fetchMetrics(
    postUrl: string,
    accessToken: string,
    accountIdentifier?: string,
  ): Promise<FetchedMetrics>;

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
  private static readonly MAX_MEDIA_PAGES = 20;
  private static readonly MEDIA_PAGE_SIZE = 50;

  async fetchMetrics(
    postUrl: string,
    accessToken: string,
    accountIdentifier?: string,
  ): Promise<FetchedMetrics> {
    // Step 1: Try to extract a shortcode from the URL
    const shortcode = this.extractShortcode(postUrl);

    if (shortcode && accountIdentifier) {
      // Step 2: Resolve shortcode to real Meta media ID via account's media library
      const resolved = await this.resolveMediaFromAccount(
        shortcode,
        accountIdentifier,
        accessToken,
      );

      // DIAG LOG #1: After shortcode resolution
      console.log("[IG-DIAG] #1 shortcode resolution:", JSON.stringify({
        shortcode,
        accountIdentifier,
        resolvedMediaId: resolved?.mediaId ?? null,
        resolvedUsername: resolved?.username ?? null,
        found: !!resolved,
      }));

      if (!resolved) {
        throw new Error(
          `Could not resolve Instagram shortcode "${shortcode}" to a media ID. ` +
          `The post may not belong to the connected account, or the account may not have this post.`,
        );
      }

      // Step 3: Verify ownership via username on the resolved media
      if (resolved.username) {
        // Ownership is verified — the media was found in the connected account's library
        // No need for an extra API call; the fact that it appeared in this account's media
        // list proves ownership.
      }

      return this.fetchMetricsById(resolved.mediaId, accessToken);
    }

    // Fallback: if no shortcode or no account ID, try direct lookup
    // (this handles edge cases like direct media IDs in URLs)
    if (shortcode) {
      // Without accountIdentifier we cannot resolve — fail closed
      throw new Error(
        `Instagram shortcode "${shortcode}" requires an account identifier to resolve. ` +
        `Ensure the clip has a connected Instagram account.`,
      );
    }

    throw new Error(
      `Could not extract a valid shortcode from URL: ${postUrl}`,
    );
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

    // DIAG LOG #2: After media lookup
    console.log("[IG-DIAG] #2 media lookup:", JSON.stringify({
      mediaId,
      media_type: media.media_type,
      media_product_type: media.media_product_type,
      username: media.username,
      permalink: media.permalink,
      like_count: media.like_count,
      comments_count: media.comments_count,
      shares_count: media.shares?.count,
      caption: media.caption?.substring(0, 80),
    }));

    // 2. Fetch engagement metrics from the media object
    //    likes, comments_count, shares are on the media object directly
    const likes = media.like_count ?? 0;
    const comments = media.comments_count ?? 0;
    const shares = media.shares?.count ?? 0;

    // 3. Fetch views from media insights
    //    views is the current metric (replaced deprecated impressions/plays)
    //    Available for VIDEO and REELS, may not be available for IMAGE
    let views = 0;
    let insightsFailed = false;
    let _insightsErrorReason = "";

    try {
      const insightsRes = await fetch(
        `${InstagramMetricProvider.API_BASE}/${mediaId}/insights?metric=views&access_token=${accessToken}`,
      );

      // DIAG LOG #3: After insights API request
      let insightsBody: unknown = null;
      try { insightsBody = await insightsRes.json(); } catch { insightsBody = "<unreadable>"; }

      const parsedViews = (() => {
        if (!insightsRes.ok) return 0;
        const b = insightsBody as Record<string, unknown> | null;
        const d = b?.data as Array<Record<string, unknown>> | undefined;
        const m = d?.find((x) => x.name === "views");
        const v = (m?.values as Array<Record<string, unknown>> | undefined)?.[0]?.value;
        return typeof v === "number" ? v : 0;
      })();

      console.log("[IG-DIAG] #3 insights response:", JSON.stringify({
        mediaId,
        httpStatus: insightsRes.status,
        httpStatusText: insightsRes.statusText,
        responseBody: insightsBody,
        parsedViews,
        likes,
        comments,
        shares,
        metricFound: ((insightsBody as Record<string, unknown>)?.data as Array<Record<string, unknown>> | undefined)?.some((x) => x.name === "views") ?? false,
      }));

      if (insightsRes.ok) {
        views = parsedViews;
      } else {
        // Insights request failed — do NOT treat views=0 as verified
        insightsFailed = true;
        const err = insightsBody as Record<string, unknown> | null;
        const errObj = err?.error as Record<string, unknown> | undefined;
        const errMsg = String(errObj?.message ?? insightsRes.statusText);

        // Detect specific Meta error: media posted before Business account conversion
        if (errMsg.toLowerCase().includes("posted before") && errMsg.toLowerCase().includes("business")) {
          _insightsErrorReason = "media_posted_before_business_conversion";
          console.error(
            `[instagram-metrics] Insights unavailable for ${mediaId}: ` +
            `media was posted before this account was converted to a Business account. ` +
            `Views cannot be retrieved for this post.`,
          );
        } else if (errObj?.code === 100) {
          // Error 100 = parameter error (metric not supported for this media type)
          // This is expected for IMAGE posts — not a failure, just N/A
          insightsFailed = false;
          _insightsErrorReason = "metric_not_supported_for_media_type";
        } else {
          _insightsErrorReason = `api_error_${insightsRes.status}: ${errMsg}`;
          console.error(
            `[instagram-metrics] Insights fetch failed for ${mediaId}:`,
            errMsg,
          );
        }
      }
    } catch (e) {
      // Network error — views stay at 0, mark as failed
      insightsFailed = true;
      _insightsErrorReason = `network_error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[IG-DIAG] #3 insights network error:", JSON.stringify({
        mediaId,
        error: e instanceof Error ? e.message : String(e),
      }));
    }

    return {
      views,
      likes,
      comments,
      shares,
      username: media.username,
      fetchedAt: new Date(),
      source: "platform_api",
      verificationStatus: insightsFailed ? "failed" : "verified",
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
   * Resolve an Instagram shortcode to the real Meta media ID by searching
   * the connected account's media library. Uses the shortcode field on
   * each media item to match the submitted URL's shortcode.
   *
   * Returns the real media ID and username if found, null otherwise.
   * Fails closed: if the media cannot be found, returns null.
   */
  private async resolveMediaFromAccount(
    shortcode: string,
    accountIdentifier: string,
    accessToken: string,
  ): Promise<{ mediaId: string; username: string } | null> {
    let url: string | null =
      `${InstagramMetricProvider.API_BASE}/${accountIdentifier}/media` +
      `?fields=id,shortcode,username,media_type` +
      `&limit=${InstagramMetricProvider.MEDIA_PAGE_SIZE}` +
      `&access_token=${accessToken}`;

    let pageCount = 0;

    while (url && pageCount < InstagramMetricProvider.MAX_MEDIA_PAGES) {
      const res = await fetch(url);
      if (!res.ok) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const mediaList: Array<{ id: string; shortcode?: string; username?: string }> = data.data ?? [];

      for (const media of mediaList) {
        if (media.shortcode === shortcode) {
          return { mediaId: media.id, username: media.username ?? "" };
        }
      }

      url = data.paging?.next ?? null;
      pageCount++;
    }

    return null;
  }

  /**
   * Extract Instagram shortcode from various URL formats.
   *
   * The shortcode is the URL slug (e.g., "ABC123" from instagram.com/reel/ABC123/).
   * This is NOT the same as the Meta media ID.
   *
   * Supported formats:
   *   - https://www.instagram.com/reel/<shortcode>/
   *   - https://www.instagram.com/p/<shortcode>/
   *   - https://www.instagram.com/tv/<shortcode>/
   */
  private extractShortcode(url: string): string | null {
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

    return null;
  }
}

// ── YouTube (Data API v3) ───────────────────────────────────────────────────

class YouTubeMetricProvider implements MetricProvider {
  platform: Platform = "YouTube";

  async fetchMetrics(
    postUrl: string,
    accessToken: string,
    _accountIdentifier?: string,
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
    _accountIdentifier?: string,
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
