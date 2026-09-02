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
// ---------------------------------------------------------------------------

import type { Platform } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FetchedMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
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

// ── Instagram (Meta Graph API) ──────────────────────────────────────────────

class InstagramMetricProvider implements MetricProvider {
  platform: Platform = "Instagram";

  async fetchMetrics(
    postUrl: string,
    accessToken: string,
  ): Promise<FetchedMetrics> {
    const mediaId = this.extractMediaId(postUrl);
    if (!mediaId) {
      throw new Error(`Could not extract media ID from URL: ${postUrl}`);
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}?fields=like_count,comments_count,shares&access_token=${accessToken}`,
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Instagram metrics fetch failed: ${err.error?.message ?? res.statusText}`,
      );
    }

    const data = await res.json();

    // For views, Instagram requires the media_insights edge
    const insightsRes = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}/insights?metric=impressions,plays&access_token=${accessToken}`,
    );

    let views = 0;
    if (insightsRes.ok) {
      const insights = await insightsRes.json();
      const impressions = insights.data?.find(
        (d: { name: string }) => d.name === "impressions",
      );
      const plays = insights.data?.find(
        (d: { name: string }) => d.name === "plays",
      );
      views = plays?.values?.[0]?.value ?? impressions?.values?.[0]?.value ?? 0;
    }

    return {
      views,
      likes: data.like_count ?? 0,
      comments: data.comments_count ?? 0,
      shares: data.shares?.count ?? 0,
      fetchedAt: new Date(),
      source: "platform_api",
      verificationStatus: "verified",
    };
  }

  async fetchAccountMetrics(
    _accountIdentifier: string,
    _accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>> {
    throw new Error("Instagram batch metrics not yet implemented");
  }

  private extractMediaId(url: string): string | null {
    const match = url.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[1] ?? null;
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
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) {
      throw new Error(`YouTube metrics fetch failed: ${res.statusText}`);
    }

    const data = await res.json();
    const stats = data.items?.[0]?.statistics;

    if (!stats) {
      throw new Error(`No statistics found for video: ${videoId}`);
    }

    return {
      views: parseInt(stats.viewCount ?? "0", 10),
      likes: parseInt(stats.likeCount ?? "0", 10),
      comments: parseInt(stats.commentCount ?? "0", 10),
      shares: 0, // YouTube API doesn't expose share counts directly
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
      return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
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
