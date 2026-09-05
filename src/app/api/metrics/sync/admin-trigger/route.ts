// ---------------------------------------------------------------------------
// POST /api/metrics/sync/admin-trigger
// Admin-only endpoint for immediate system-wide metrics sync.
// Uses database-backed lease lock to prevent overlapping sync jobs.
// The lock is stored in sync_locks table (same table as cron endpoint),
// so it reliably prevents overlap across Supabase connection pool boundaries.
// Reports detailed progress back to the admin.
//
// Authorization: Admin session only (Bearer token).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
import { getProvider } from "@/lib/social-providers";
import { decryptToken, encryptToken, isTokenExpired } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

const LOCK_KEY = "metrics_sync";
const LOCK_TTL_SECONDS = 600; // 10 minutes

export async function POST(request: Request) {
  try {
    // Verify admin authentication
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

    // ── Database-backed lease lock ─────────────────────────────────────────
    // Same LOCK_KEY as the cron endpoint — both compete for the same row.
    // If the cron job is running, this request gets false and is rejected.
    const ownerId = randomUUID();

    const { data: lockAcquired } = await adminClient.rpc("acquire_sync_lock", {
      p_lock_key: LOCK_KEY,
      p_owner_id: ownerId,
      p_ttl_seconds: LOCK_TTL_SECONDS,
    });

    if (!lockAcquired) {
      return NextResponse.json({
        success: false,
        error: "A sync job is already running. Please wait for it to complete.",
      }, { status: 409 });
    }

    try {
      const startTime = Date.now();

      // Fetch all eligible approved clips
      const { data: clips, error: clipError } = await adminClient
        .from("clips")
        .select("id, platform, video_url, user_id, verified_views")
        .eq("status", "approved");

      if (clipError || !clips || clips.length === 0) {
        await adminClient.rpc("release_sync_lock", { p_lock_key: LOCK_KEY, p_owner_id: ownerId });
        return NextResponse.json({
          success: true,
          message: "No approved clips to process",
          processed: 0,
          synced: 0,
          skipped: 0,
          errors: 0,
          duration: Date.now() - startTime,
        });
      }

      const results: Array<{
        clipId: string;
        status: string;
        views?: number;
        error?: string;
      }> = [];

      // Process clips in batches of 10 to manage API quota
      const BATCH_SIZE = 10;
      for (let i = 0; i < clips.length; i += BATCH_SIZE) {
        const batch = clips.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (clip) => {
          try {
            const clipPlatform = clip.platform as Platform;

            if (!isMetricProviderConfigured(clipPlatform)) {
              results.push({
                clipId: clip.id,
                status: "skipped",
                error: `${clipPlatform} metrics API not available`,
              });
              return;
            }

            // Find social account
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
              return;
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
                error: "No tokens stored",
              });
              return;
            }

            let accessToken = decryptToken(connection.access_token_enc);

            // Token refresh if expired
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
                  error: "Token expired, no refresh token",
                });
                return;
              }

              try {
                const refreshToken = decryptToken(connFull.refresh_token_enc);
                const provider = getProvider(clipPlatform);
                const refreshed = await provider.refreshToken(refreshToken);

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
                await adminClient
                  .from("social_accounts")
                  .update({ status: "connection_error", error: "Token refresh failed — reconnect required" })
                  .eq("id", socialAccount.id)
                  .eq("user_id", clip.user_id);

                results.push({
                  clipId: clip.id,
                  status: "skipped",
                  error: "Token refresh failed",
                });
                return;
              }
            }

            const provider = getMetricProvider(clipPlatform);
            const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

            // YouTube ownership verification
            if (clipPlatform === "YouTube") {
              if (!metrics.channelId || !socialAccount.provider_account_id) {
                results.push({
                  clipId: clip.id,
                  status: "rejected",
                  error: "YouTube ownership could not be verified",
                });
                return;
              }
              if (metrics.channelId !== socialAccount.provider_account_id) {
                results.push({
                  clipId: clip.id,
                  status: "rejected",
                  error: "Video does not belong to connected YouTube channel",
                });
                return;
              }
            }

            // Persist via ingest_clip_metrics
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
              return;
            }

            results.push({
              clipId: clip.id,
              status: "synced",
              views: metrics.views,
            });
          } catch (e) {
            results.push({
              clipId: clip.id,
              status: "error",
              error: e instanceof Error ? e.message : "Sync failed",
            });
          }
        }));
      }

      const synced = results.filter((r) => r.status === "synced").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const errors = results.filter((r) => r.status === "error" || r.status === "rejected").length;
      const duration = Date.now() - startTime;

      console.log(`[admin-metrics-sync] Completed: ${synced} synced, ${skipped} skipped, ${errors} errors, ${duration}ms`);

      // Release lock (only if we still own it)
      await adminClient.rpc("release_sync_lock", { p_lock_key: LOCK_KEY, p_owner_id: ownerId });

      return NextResponse.json({
        success: true,
        processed: results.length,
        synced,
        skipped,
        errors,
        duration,
        results,
      });
    } catch (e) {
      // Release lock on error
      await adminClient.rpc("release_sync_lock", { p_lock_key: LOCK_KEY, p_owner_id: ownerId });
      throw e;
    }
  } catch (e) {
    console.error("[admin-metrics-sync]", e);
    return NextResponse.json(
      { error: "Admin metrics sync failed" },
      { status: 500 },
    );
  }
}
