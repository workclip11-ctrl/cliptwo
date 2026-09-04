// ---------------------------------------------------------------------------
// GET /api/metrics/sync/cron
// Vercel-compatible cron endpoint for periodic metric synchronization.
// Processes approved clips whose metrics need refreshing.
//
// Authorization: Vercel Cron header (CRON_SECRET) or admin session.
// Uses service_role for all DB operations.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
import { getProvider } from "@/lib/social-providers";
import { decryptToken, encryptToken, isTokenExpired } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

export async function GET(request: Request) {
  try {
    // Verify authorization: Vercel cron or admin session
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isVercelCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isVercelCron) {
      // Fall back to admin session check via Bearer token or cookie
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const adminClient = createServiceClient();
      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", authUser.id)
        .single();
      if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    const adminClient = createServiceClient();

    const { data: clips, error: clipError } = await adminClient
      .from("clips")
      .select("id, platform, video_url, user_id, verified_views")
      .eq("status", "approved")
      .limit(50);

    if (clipError || !clips || clips.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No approved clips to process",
        processed: 0,
      });
    }

    const results: Array<{
      clipId: string;
      status: string;
      error?: string;
    }> = [];

    for (const clip of clips) {
      try {
        const clipPlatform = clip.platform as Platform;

        // Check if metric provider is available for this platform
        if (!isMetricProviderConfigured(clipPlatform)) {
          results.push({
            clipId: clip.id,
            status: "skipped",
            error: `${clipPlatform} metrics API not available`,
          });
          continue;
        }

        // Find social account for this user+platform
        const { data: socialAccount } = await adminClient
          .from("social_accounts")
          .select("id, provider_account_id")
          .eq("user_id", clip.user_id)
          .eq("platform", clipPlatform)
          .single();

        if (!socialAccount) {
          results.push({
            clipId: clip.id,
            status: "skipped",
            error: `No connected ${clipPlatform} account`,
          });
          continue;
        }

        // Read access token
        const { data: connection } = await adminClient
          .from("social_connections")
          .select("access_token_enc, expires_at")
          .eq("social_account_id", socialAccount.id)
          .single();

        if (!connection?.access_token_enc) {
          results.push({
            clipId: clip.id,
            status: "skipped",
            error: `No tokens stored`,
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
              clipId: clip.id,
              status: "skipped",
              error: `Token expired and no refresh token available`,
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
              clipId: clip.id,
              status: "skipped",
              error: `Token refresh failed`,
            });
            continue;
          }
        }

        const provider = getMetricProvider(clipPlatform);

        // Fetch metrics from the platform
        const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

        // Ownership verification (fail-closed): for YouTube, BOTH channelId and
        // provider_account_id must exist and match. Missing either = reject.
        if (clipPlatform === "YouTube") {
          if (!metrics.channelId || !socialAccount.provider_account_id) {
            results.push({
              clipId: clip.id,
              status: "rejected",
              error: "YouTube ownership could not be verified — missing channel identification",
            });
            continue;
          }
          if (metrics.channelId !== socialAccount.provider_account_id) {
            results.push({
              clipId: clip.id,
              status: "rejected",
              error: "Video does not belong to connected YouTube channel",
            });
            continue;
          }
        }

        // Store via the ingest_clip_metrics RPC (which auto-finalizes earnings)
        const { error: ingestError } = await adminClient.rpc("ingest_clip_metrics", {
          p_clip_id: clip.id,
          p_views: metrics.views,
          p_likes: metrics.likes,
          p_comments: metrics.comments,
          p_shares: metrics.shares,
          p_source: metrics.source,
          p_verification_status: metrics.verificationStatus,
        });

        if (ingestError) {
          results.push({ clipId: clip.id, status: "error", error: ingestError.message });
          continue;
        }

        results.push({ clipId: clip.id, status: "synced" });
      } catch (e) {
        results.push({
          clipId: clip.id,
          status: "error",
          error: e instanceof Error ? e.message : "Sync failed",
        });
      }
    }

    const synced = results.filter((r) => r.status === "synced").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({
      success: true,
      processed: results.length,
      synced,
      skipped,
      errors,
      results,
    });
  } catch (e) {
    console.error("[metrics/sync/cron]", e);
    return NextResponse.json(
      { error: "Cron metric sync failed" },
      { status: 500 },
    );
  }
}
