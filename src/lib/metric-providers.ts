// ---------------------------------------------------------------------------
// Metric provider abstraction — fetches verified metrics from social platforms.
//
// In production, these call the real Instagram Graph API and YouTube Data API
// to fetch view/engagement counts for a given post/video.
//
// In development (no API credentials), a mock provider returns deterministic
// fake data. The mock is CLEARLY MARKED and mock metrics are stored with
// source = 'mock' and verification_status = 'pending' — they are NEVER
// treated as production payout data.
//
// SECURITY: All metric fetches happen server-side. The client never calls
// these functions directly.
// ---------------------------------------------------------------------------

import type { Platform } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FetchedMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  fetchedAt: Date;
  source: "platform_api" | "mock";
  verificationStatus: "verified" | "pending";
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
    // Extract media ID from URL (simplified — production needs full URL parsing)
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
    // Production: fetch recent media from the account, then fetch metrics for each
    throw new Error("Instagram batch metrics not yet implemented");
  }

  private extractMediaId(url: string): string | null {
    // Match patterns like /reel/XXXXX or /p/XXXXX
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
    // Match youtube.com/watch?v=XXXXX, youtu.be/XXXXX, youtube.com/shorts/XXXXX
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

// ── Mock Provider (Development) ─────────────────────────────────────────────
//
// Returns deterministic fake data based on the post URL hash.
// Metrics are stored with source='mock' and verification_status='pending'.
// They are NEVER used for earnings calculations.

class MockMetricProvider implements MetricProvider {
  platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async fetchMetrics(postUrl: string): Promise<FetchedMetrics> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

    // Deterministic "random" based on URL hash for consistent test data
    const hash = this.simpleHash(postUrl);
    const views = 1000 + (hash % 50000);
    const likes = Math.floor(views * (0.02 + (hash % 50) / 1000));
    const comments = Math.floor(likes * (0.1 + (hash % 20) / 100));
    const shares = Math.floor(comments * 0.3);

    return {
      views,
      likes,
      comments,
      shares,
      fetchedAt: new Date(),
      source: "mock",
      verificationStatus: "pending", // Mock data is NEVER verified
    };
  }

  async fetchAccountMetrics(): Promise<
    Array<{ postUrl: string; metrics: FetchedMetrics }>
  > {
    return [];
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}

// ── Provider factory ────────────────────────────────────────────────────────

function isConfigured(platform: Platform): boolean {
  switch (platform) {
    case "Instagram":
      return !!(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
    case "YouTube":
      return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
    default:
      return false;
  }
}

export function getMetricProvider(platform: Platform): MetricProvider {
  if (!isConfigured(platform)) {
    console.warn(
      `[metric-providers] ${platform} API not configured — using mock provider. ` +
        `Mock metrics have source='mock' and verification_status='pending'. ` +
        `They MUST NOT be used for earnings calculations.`,
    );
    return new MockMetricProvider(platform);
  }

  switch (platform) {
    case "Instagram":
      return new InstagramMetricProvider();
    case "YouTube":
      return new YouTubeMetricProvider();
    default:
      return new MockMetricProvider(platform);
  }
}

export { isConfigured as isMetricProviderConfigured };
