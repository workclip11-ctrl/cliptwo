// ---------------------------------------------------------------------------
// POST /api/metrics/sync/cron
// Automatic background metric synchronization (called by pg_cron via net.http_post).
// Also accepts GET for backward compatibility with Vercel cron.
//
// Authorization: CRON_SECRET Bearer token (pg_cron / Vercel cron) or admin session.
// Uses database-backed lease lock to prevent overlap with admin-trigger manual sync.
// The lock is stored in sync_locks table (not session-level advisory lock),
// so it reliably persists across Supabase connection pool boundaries.
// Processes ALL approved clips in batches to avoid timeouts.
// Uses service_role for all DB operations.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
import { getProvider } from "@/lib/social-providers";
import { decryptToken, encryptToken, isTokenExpired } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

const BATCH_SIZE = 50;
const LOCK_KEY = "metrics_sync";
const LOCK_TTL_SECONDS = 600; // 10 minutes

async function handleSync(request: Request) {
  try {
    // ── Authorization ──────────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuth) {
      // Fall back to admin session check
      const authUser = await getAuthenticatedUser(request);
      if (!authUser) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }
      const authClient = createServiceClient();
      const { data: profile } = await authClient
        .from("profiles")
        .select("role")
        .eq("id", authUser.id)
        .single();
      if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    const adminClient = createServiceClient();

    // ── Database-backed lease lock ─────────────────────────────────────────
    // Each request generates a unique owner_id. The lock is stored in
    // sync_locks table, which persists across connection pool boundaries.
    // If a crashed process holds the lock, it auto-expires after LOCK_TTL_SECONDS.
    const ownerId = randomUUID();

    const { data: lockAcquired } = await adminClient.rpc("acquire_sync_lock", {
      p_lock_key: LOCK_KEY,
      p_owner_id: ownerId,
      p_ttl_seconds: LOCK_TTL_SECONDS,
    });

    if (!lockAcquired) {
      return NextResponse.json({
        success: true,
        message: "Sync already in progress — skipping",
        processed: 0,
      });
    }

    try {
      // ── Fetch ALL approved clips in batches ───────────────────────────────
      const results: Array<{ clipId: string; status: string; error?: string }> = [];
      let offset = 0;

      while (true) {
        const { data: batch, error: batchError } = await adminClient
          .from("clips")
          .select("id, platform, video_url, user_id, verified_views")
          .eq("status", "approved")
          .range(offset, offset + BATCH_SIZE - 1);

        if (batchError || !batch || batch.length === 0) break;

        for (const clip of batch) {
          try {
            const clipPlatform = clip.platform as Platform;

            if (!isMetricProviderConfigured(clipPlatform)) {
              results.push({ clipId: clip.id, status: "skipped", error: `${clipPlatform} metrics API not available` });
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
              results.push({ clipId: clip.id, status: "skipped", error: `No connected ${clipPlatform} account` });
              continue;
            }

            // Read access token
            const { data: connection } = await adminClient
              .from("social_connections")
              .select("access_token_enc, expires_at")
              .eq("social_account_id", socialAccount.id)
              .single();

            if (!connection?.access_token_enc) {
              results.push({ clipId: clip.id, status: "skipped", error: "No tokens stored" });
              continue;
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
                results.push({ clipId: clip.id, status: "skipped", error: "Token expired, no refresh token" });
                continue;
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

                results.push({ clipId: clip.id, status: "skipped", error: "Token refresh failed" });
                continue;
              }
            }

            const provider = getMetricProvider(clipPlatform);
            const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

            // YouTube ownership verification (fail-closed)
            if (clipPlatform === "YouTube") {
              if (!metrics.channelId || !socialAccount.provider_account_id) {
                results.push({ clipId: clip.id, status: "rejected", error: "YouTube ownership could not be verified — missing channel identification" });
                continue;
              }
              if (metrics.channelId !== socialAccount.provider_account_id) {
                results.push({ clipId: clip.id, status: "rejected", error: "Video does not belong to connected YouTube channel" });
                continue;
              }
            }

            // Persist via ingest_clip_metrics (auto-finalizes earnings)
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
            results.push({ clipId: clip.id, status: "error", error: e instanceof Error ? e.message : "Sync failed" });
          }
        }

        if (batch.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }

      const synced = results.filter((r) => r.status === "synced").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const errors = results.filter((r) => r.status === "error").length;

      console.log(`[cron-metrics-sync] Completed: ${synced} synced, ${skipped} skipped, ${errors} errors, ${results.length} total`);

      // Release lock (only if we still own it)
      await adminClient.rpc("release_sync_lock", { p_lock_key: LOCK_KEY, p_owner_id: ownerId });

      return NextResponse.json({
        success: true,
        processed: results.length,
        synced,
        skipped,
        errors,
        results,
      });
    } catch (e) {
      // Release lock on error
      await adminClient.rpc("release_sync_lock", { p_lock_key: LOCK_KEY, p_owner_id: ownerId });
      throw e;
    }
  } catch (e) {
    console.error("[cron-metrics-sync]", e);
    return NextResponse.json({ error: "Cron metric sync failed" }, { status: 500 });
  }
}

// POST: primary handler (called by pg_cron net.http_post)
export async function POST(request: Request) {
  return handleSync(request);
}

// GET: backward-compatible alias (Vercel cron, manual browser testing)
export { POST as GET };
