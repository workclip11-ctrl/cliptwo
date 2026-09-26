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
  /**
   * Sanitized failure classification — ONLY set when verificationStatus
   * !== "verified" (undefined on verified results).
   *
   * Strict allowlist (bounded, no provider text, no tokens):
   *   metric_missing_in_response
   *   media_posted_before_business_conversion
   *   metric_not_supported_for_media_type
   *   api_error_<http_status>
   *   network_error
   *
   * Never contains raw Meta error messages, response bodies, URLs,
   * access tokens, or captions.
   */
  insightsError?: string;
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

  /**
   * Fetch a Graph API URL with the access token in the Authorization header
   * instead of the query string. Meta's paging.next URLs embed an
   * access_token — it is stripped here so a token never appears in a
   * request URL (URLs leak into logs, proxies, and traces).
   */
  private igFetch(rawUrl: string, accessToken: string): Promise<Response> {
    let url = rawUrl;
    if (rawUrl.includes("access_token=")) {
      const parsed = new URL(rawUrl);
      parsed.searchParams.delete("access_token");
      url = parsed.toString();
    }
    return fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

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

      // DIAG LOG: After shortcode resolution (account ID prefix-only)
      console.log("[instagram] shortcode resolution:", JSON.stringify({
        shortcode,
        account: accountIdentifier.slice(0, 8),
        found: !!resolved,
        resolvedMediaId: resolved?.mediaId ?? null,
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
    // 1. Fetch media details (type, product type, username, caption, engagement).
    //    Engagement counts (like_count, comments_count, shares) must be requested
    //    explicitly — Meta only returns requested fields. If the API rejects a
    //    field tier (e.g. `shares` unsupported for the account), fall back to
    //    progressively safer field sets so views tracking never breaks.
    const mediaFieldTiers = [
      "id,media_type,media_product_type,username,caption,permalink,like_count,comments_count,shares",
      "id,media_type,media_product_type,username,caption,permalink,like_count,comments_count",
      "id,media_type,media_product_type,username,caption,permalink",
    ];

    let media: Record<string, unknown> | null = null;
    let mediaErr: { message?: string } | null = null;
    let mediaHttpStatus = 0;
    let mediaFieldTier = -1;

    for (let tier = 0; tier < mediaFieldTiers.length; tier++) {
      const mediaRes = await fetch(
        `${InstagramMetricProvider.API_BASE}/${mediaId}?fields=${mediaFieldTiers[tier]}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      mediaHttpStatus = mediaRes.status;

      if (mediaRes.ok) {
        media = await mediaRes.json();
        mediaFieldTier = tier;
        break;
      }
      mediaErr = await mediaRes.json().catch(() => ({})) as { message?: string };
      // Only fall back when the request itself failed — never retry on success.
      console.warn(
        `[instagram] media fields tier ${tier} rejected (HTTP ${mediaRes.status}) — ` +
        `retrying with reduced field set`,
      );
    }

    if (!media) {
      throw new Error(
        `Instagram media fetch failed: ${mediaErr?.message ?? `HTTP ${mediaHttpStatus}`}`,
      );
    }

    // DIAG LOG: After media lookup (no caption bodies, no tokens)
    console.log("[instagram] media lookup:", JSON.stringify({
      mediaId,
      fieldTier: mediaFieldTier,
      httpStatus: mediaHttpStatus,
      media_type: media.media_type,
      media_product_type: media.media_product_type,
      username: media.username,
      like_count: media.like_count,
      comments_count: media.comments_count,
      shares_count: typeof media.shares === "number"
        ? media.shares
        : (media.shares as { count?: number } | undefined)?.count,
    }));

    // 2. Engagement metrics are on the media object — but only if the field
    //    tier that requested them succeeded. Missing field ⇒ 0 is a genuine
    //    "not requested/unavailable", not a metric the provider reported.
    const likes = typeof media.like_count === "number" ? media.like_count : 0;
    const comments =
      typeof media.comments_count === "number" ? media.comments_count : 0;
    const shares =
      typeof media.shares === "number"
        ? media.shares
        : (media.shares as { count?: number } | undefined)?.count ?? 0;

    // 3. Fetch views from media insights
    //    views is the current metric (replaced deprecated impressions/plays)
    //    Available for VIDEO and REELS, may not be available for IMAGE
    //
    //    insightsError holds a SANITIZED, allowlisted classification only.
    //    Raw provider error messages are used internally to pick the
    //    category, then discarded — they are never returned or logged.
    let views = 0;
    let insightsFailed = false;
    let insightsError = "";

    try {
      const insightsRes = await fetch(
        `${InstagramMetricProvider.API_BASE}/${mediaId}/insights?metric=views`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      // DIAG LOG: After insights API request (compact — metric verification
      // status + HTTP status only, never the access token)
      let insightsBody: unknown = null;
      try { insightsBody = await insightsRes.json(); } catch { insightsBody = "<unreadable>"; }

      const body = insightsBody as Record<string, unknown> | null;
      const entries = body?.data as Array<Record<string, unknown>> | undefined;
      const viewsEntry = entries?.find((x) => x.name === "views");
      const rawValue = (viewsEntry?.values as Array<Record<string, unknown>> | undefined)
        ?.[0]?.value;
      const metricFound = typeof rawValue === "number";

      console.log("[instagram] insights fetch:", JSON.stringify({
        mediaId,
        httpStatus: insightsRes.status,
        metricFound,
        parsedViews: metricFound ? rawValue : null,
        likes,
        comments,
        shares,
      }));

      if (insightsRes.ok) {
        if (metricFound) {
          // Genuine provider value — including a real 0 — is verified.
          views = rawValue;
          insightsFailed = false;
        } else {
          // HTTP 200 but the views metric is absent: availability is unknown.
          // Fail closed — never ingest an unavailable metric as verified 0.
          insightsFailed = true;
          insightsError = "metric_missing_in_response";
          console.warn(
            `[instagram] Insights response for ${mediaId} missing "views" metric — ` +
            `marking verification failed (fail-closed)`,
          );
        }
      } else {
        // Insights request failed — do NOT treat views=0 as verified.
        // This includes Meta error 100 (metric not supported for this media
        // type, e.g. IMAGE posts): unavailable insights fail closed.
        //
        // errMsg is read ONLY to classify the failure. It (and the raw
        // response body) never leaves this block — not returned, not logged.
        insightsFailed = true;
        const errObj = body?.error as Record<string, unknown> | undefined;
        const errMsg = String(errObj?.message ?? insightsRes.statusText);

        if (errMsg.toLowerCase().includes("posted before") && errMsg.toLowerCase().includes("business")) {
          insightsError = "media_posted_before_business_conversion";
          console.warn(
            `[instagram] Insights unavailable for ${mediaId}: ` +
            `media was posted before this account was converted to a Business account. ` +
            `Views cannot be retrieved for this post.`,
          );
        } else if (errObj?.code === 100) {
          // Error 100 = parameter/metric error (not supported for this media type)
          insightsError = "metric_not_supported_for_media_type";
          console.warn(
            `[instagram] Insights metric "views" not supported for media ${mediaId} ` +
            `(error 100) — marking verification failed (fail-closed)`,
          );
        } else {
          // Allowlisted classification: HTTP status only, never the raw message.
          insightsError = `api_error_${insightsRes.status}`;
          console.error(
            `[instagram] Insights fetch failed for ${mediaId} (HTTP ${insightsRes.status}) — ` +
            `classification: ${insightsError}`,
          );
        }
      }
    } catch (e) {
      // Network error — views stay at 0, mark as failed.
      // Allowlisted classification only: raw error messages can embed the
      // request URL (which contains the access token) and must not be logged.
      insightsFailed = true;
      insightsError = "network_error";
      console.error("[instagram] insights network error:", JSON.stringify({
        mediaId,
        errorName: e instanceof Error ? e.name : typeof e,
      }));
    }

    return {
      views,
      likes,
      comments,
      shares,
      username: media.username as string | undefined,
      fetchedAt: new Date(),
      source: "platform_api",
      verificationStatus: insightsFailed ? "failed" : "verified",
      // Sanitized diagnostic attached only on failure; verified results
      // carry no insightsError (undefined).
      ...(insightsFailed && insightsError ? { insightsError } : {}),
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
      `&limit=${InstagramMetricProvider.MEDIA_PAGE_SIZE}`;

    let pageCount = 0;

    while (url && pageCount < InstagramMetricProvider.MAX_MEDIA_PAGES) {
      const res = await this.igFetch(url, accessToken);
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
      `&limit=${InstagramMetricProvider.MEDIA_PAGE_SIZE}`;

    let pageCount = 0;
    let scanned = 0;

    while (url && pageCount < InstagramMetricProvider.MAX_MEDIA_PAGES) {
      const res = await this.igFetch(url, accessToken);
      if (!res.ok) {
        // Fail closed, but leave a diagnosable trace (HTTP status only).
        console.warn(
          `[instagram] media library scan failed (HTTP ${res.status}) after ` +
          `${pageCount} page(s) / ${scanned} item(s), account: ${accountIdentifier.slice(0, 8)}`,
        );
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      const mediaList: Array<{ id: string; shortcode?: string; username?: string }> = data.data ?? [];
      scanned += mediaList.length;

      for (const media of mediaList) {
        if (media.shortcode === shortcode) {
          return { mediaId: media.id, username: media.username ?? "" };
        }
      }

      url = data.paging?.next ?? null;
      pageCount++;
    }

    console.warn(
      `[instagram] shortcode "${shortcode}" not found after scanning ` +
      `${pageCount} page(s) / ${scanned} item(s) (max ${InstagramMetricProvider.MAX_MEDIA_PAGES} pages), ` +
      `account: ${accountIdentifier.slice(0, 8)}`,
    );
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
      // Fail closed: throw so the sync routes never ingest a fabricated 0.
      // HTTP status only — response bodies may echo request parameters.
      console.error(`[youtube] videos.list failed (HTTP ${res.status}) for video ${videoId}`);
      throw new Error(`YouTube metrics fetch failed: HTTP ${res.status}`);
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
    accountIdentifier: string,
    accessToken: string,
  ): Promise<Array<{ postUrl: string; metrics: FetchedMetrics }>> {
    // Batch path: resolve the channel's uploads playlist, page through it
    // (bounded), then fetch statistics in 50-video batches. Ownership is
    // enforced here too — only videos whose snippet.channelId matches the
    // connected channel are returned.
    const headers = { Authorization: `Bearer ${accessToken}` };
    const results: Array<{ postUrl: string; metrics: FetchedMetrics }> = [];
    const MAX_UPLOAD_PAGES = 5;
    const PAGE_SIZE = 50;

    const channelRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${accountIdentifier}`,
      { headers },
    );
    if (!channelRes.ok) {
      throw new Error(`YouTube channel fetch failed: HTTP ${channelRes.status}`);
    }
    const channelData = await channelRes.json();
    const uploadsPlaylistId =
      channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new Error("No uploads playlist found for YouTube channel");
    }

    const videoIds: string[] = [];
    let pageToken = "";
    let pages = 0;
    while (pages < MAX_UPLOAD_PAGES) {
      const url =
        `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails` +
        `&playlistId=${uploadsPlaylistId}&maxResults=${PAGE_SIZE}` +
        (pageToken ? `&pageToken=${pageToken}` : "");
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`YouTube uploads fetch failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      for (const item of data.items ?? []) {
        const id = item?.contentDetails?.videoId;
        if (typeof id === "string") videoIds.push(id);
      }
      pageToken = data.nextPageToken ?? "";
      pages++;
      if (!pageToken) break;
    }

    for (let i = 0; i < videoIds.length; i += PAGE_SIZE) {
      const batchIds = videoIds.slice(i, i + PAGE_SIZE).join(",");
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${batchIds}`,
        { headers },
      );
      if (!res.ok) {
        throw new Error(`YouTube videos fetch failed: HTTP ${res.status}`);
      }
      const data = await res.json();
      for (const video of data.items ?? []) {
        const snippet = video.snippet;
        const stats = video.statistics;
        if (!snippet?.channelId || snippet.channelId !== accountIdentifier) {
          continue; // fail-closed: never return metrics for foreign videos
        }
        results.push({
          postUrl: `https://www.youtube.com/watch?v=${video.id}`,
          metrics: {
            views: parseInt(stats?.viewCount ?? "0", 10),
            likes: parseInt(stats?.likeCount ?? "0", 10),
            comments: parseInt(stats?.commentCount ?? "0", 10),
            shares: 0,
            channelId: snippet.channelId,
            fetchedAt: new Date(),
            source: "platform_api",
            verificationStatus: "verified",
          },
        });
      }
    }

    return results;
  }

  private extractVideoId(url: string): string | null {
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
      /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
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

// ── Ownership verification (shared by all sync routes) ─────────────────────
//
// Fail-closed: metrics are only accepted when the provider-reported identity
// (YouTube channelId / Instagram username) matches the connected
// social_accounts row for the clip owner. Pure function — unit-tested.

export interface MetricOwnershipInput {
  platform: Platform;
  metrics: Pick<FetchedMetrics, "channelId" | "username">;
  accountProviderId: string | null | undefined;
  accountHandle: string | null | undefined;
}

export interface MetricOwnershipResult {
  ok: boolean;
  error?: string;
}

export function verifyMetricOwnership(
  input: MetricOwnershipInput,
): MetricOwnershipResult {
  const { platform, metrics, accountProviderId, accountHandle } = input;

  if (platform === "YouTube") {
    if (!metrics.channelId || !accountProviderId) {
      return {
        ok: false,
        error: "YouTube ownership could not be verified — missing channel identification",
      };
    }
    if (metrics.channelId !== accountProviderId) {
      return {
        ok: false,
        error: "This YouTube video does not belong to your connected YouTube channel",
      };
    }
    return { ok: true };
  }

  if (platform === "Instagram") {
    if (!metrics.username) {
      return {
        ok: false,
        error:
          "Instagram ownership could not be verified — missing username on resolved media",
      };
    }
    if (metrics.username.toLowerCase() !== (accountHandle ?? "").toLowerCase()) {
      return {
        ok: false,
        error: `This Instagram post does not belong to your connected account (expected "${accountHandle}", got "${metrics.username}")`,
      };
    }
    return { ok: true };
  }

  // Kick and other platforms: no metric provider — reject.
  return {
    ok: false,
    error: `${platform} ownership verification is not available`,
  };
}
