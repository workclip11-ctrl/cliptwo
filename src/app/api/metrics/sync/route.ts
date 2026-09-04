// ---------------------------------------------------------------------------
// POST /api/metrics/sync
// Triggers metric synchronization for a clip or batch of clips.
// Fetches verified metrics from the platform API and stores them via
// the ingest_clip_metrics() RPC.
//
// Uses service_role to read encrypted tokens from social_connections.
// Only verified platform API metrics are stored with verification_status='verified'.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
import { getProvider } from "@/lib/social-providers";
import { decryptToken, encryptToken, isTokenExpired } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { clipId, clipIds, platform } = (await request.json()) as {
      clipId?: string;
      clipIds?: string[];
      platform?: Platform;
    };

    // Verify authenticated user
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const adminClient = createServiceClient();

    // Check if user is admin (admins can sync any clips)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authUser.id)
      .single();

    const isAdmin = profile?.role === "admin";

    // Determine which clips to sync
    let targetClipIds: string[] = [];
    if (clipIds && clipIds.length > 0) {
      targetClipIds = clipIds;
    } else if (clipId) {
      targetClipIds = [clipId];
    } else {
      return NextResponse.json(
        { error: "clipId or clipIds required" },
        { status: 400 },
      );
    }

    const results: Array<{
      clipId: string;
      status: string;
      metrics?: { views: number; likes: number; comments: number; shares: number };
      source?: string;
      error?: string;
    }> = [];

    for (const cid of targetClipIds) {
      try {
        // Get clip details
        const { data: clip, error: clipError } = await adminClient
          .from("clips")
          .select("id, platform, video_url, user_id")
          .eq("id", cid)
          .single();

        if (clipError || !clip) {
          results.push({ clipId: cid, status: "error", error: "Clip not found" });
          continue;
        }

        // Non-admins can only sync their own clips
        if (!isAdmin && clip.user_id !== authUser.id) {
          results.push({ clipId: cid, status: "error", error: "Not authorized to sync this clip" });
          continue;
        }

        const clipPlatform = (clip.platform ?? platform) as Platform;
        if (!clipPlatform) {
          results.push({ clipId: cid, status: "error", error: "No platform specified" });
          continue;
        }

        // Check if metric provider is available for this platform
        if (!isMetricProviderConfigured(clipPlatform)) {
          results.push({
            clipId: cid,
            status: "skipped",
            error: `${clipPlatform} metrics API not available`,
          });
          continue;
        }

        const provider = getMetricProvider(clipPlatform);

        // Read access token from social_connections using service_role
        // Find the social account for this user+platform
        const { data: socialAccount } = await adminClient
          .from("social_accounts")
          .select("id, provider_account_id")
          .eq("user_id", clip.user_id)
          .eq("platform", clipPlatform)
          .single();

        if (!socialAccount) {
          results.push({
            clipId: cid,
            status: "skipped",
            error: `No connected ${clipPlatform} account for this user`,
          });
          continue;
        }

        const { data: connection } = await adminClient
          .from("social_connections")
          .select("access_token_enc, expires_at")
          .eq("social_account_id", socialAccount.id)
          .single();

        if (!connection?.access_token_enc) {
          results.push({
            clipId: cid,
            status: "skipped",
            error: `No tokens stored for this ${clipPlatform} account`,
          });
          continue;
        }

        let accessToken = decryptToken(connection.access_token_enc);

        // Token refresh: if expired, try to refresh using the refresh token
        if (isTokenExpired(connection.expires_at)) {
          const { data: connFull } = await adminClient
            .from("social_connections")
            .select("refresh_token_enc")
            .eq("social_account_id", socialAccount.id)
            .single();

          if (!connFull?.refresh_token_enc) {
            results.push({
              clipId: cid,
              status: "skipped",
              error: `${clipPlatform} token expired and no refresh token available — reconnect the account`,
            });
            continue;
          }

          try {
            const refreshToken = decryptToken(connFull.refresh_token_enc);
            const provider = getProvider(clipPlatform);
            const refreshed = await provider.refreshToken(refreshToken);

            // Persist the new encrypted tokens
            await adminClient
              .from("social_connections")
              .update({
                access_token_enc: encryptToken(refreshed.accessToken),
                refresh_token_enc: refreshed.refreshToken
                  ? encryptToken(refreshed.refreshToken)
                  : connFull.refresh_token_enc,
                expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("social_account_id", socialAccount.id);

            accessToken = refreshed.accessToken;
          } catch {
            // Mark connection as needing reconnect
            await adminClient
              .from("social_accounts")
              .update({ status: "connection_error", error: "Token refresh failed — reconnect required" })
              .eq("id", socialAccount.id)
              .eq("user_id", clip.user_id);

            results.push({
              clipId: cid,
              status: "skipped",
              error: `${clipPlatform} token refresh failed — reconnect the account`,
            });
            continue;
          }
        }

        // Fetch metrics from the platform
        const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

        // Ownership verification (fail-closed): for YouTube, BOTH channelId and
        // provider_account_id must exist and match. Missing either = reject.
        if (clipPlatform === "YouTube") {
          if (!metrics.channelId || !socialAccount.provider_account_id) {
            results.push({
              clipId: cid,
              status: "rejected",
              error: "YouTube ownership could not be verified — missing channel identification",
            });
            continue;
          }
          if (metrics.channelId !== socialAccount.provider_account_id) {
            results.push({
              clipId: cid,
              status: "rejected",
              error: "This YouTube video does not belong to your connected YouTube channel",
            });
            continue;
          }
        }

        // Store via the ingest_clip_metrics RPC (service_role-only)
        const { error: ingestError } = await adminClient.rpc(
          "ingest_clip_metrics",
          {
            p_clip_id: cid,
            p_views: metrics.views,
            p_likes: metrics.likes,
            p_comments: metrics.comments,
            p_shares: metrics.shares,
            p_source: metrics.source,
            p_verification_status: metrics.verificationStatus,
          },
        );

        if (ingestError) {
          results.push({ clipId: cid, status: "error", error: ingestError.message });
          continue;
        }

        results.push({
          clipId: cid,
          status: "synced",
          source: metrics.source,
          metrics: {
            views: metrics.views,
            likes: metrics.likes,
            comments: metrics.comments,
            shares: metrics.shares,
          },
        });
      } catch (e) {
        results.push({
          clipId: cid,
          status: "error",
          error: e instanceof Error ? e.message : "Sync failed",
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[metrics/sync]", e);
    return NextResponse.json(
      { error: "Metric sync failed" },
      { status: 500 },
    );
  }
}
