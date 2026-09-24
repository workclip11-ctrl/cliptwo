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
import {
  getMetricProvider,
  isMetricProviderConfigured,
  verifyMetricOwnership,
} from "@/lib/metric-providers";
import { getProvider } from "@/lib/social-providers";
import {
  decryptToken,
  encryptToken,
  isTokenExpired,
  isTokenExpiringSoon,
} from "@/lib/token-crypto";
import { sanitizeError } from "@/lib/api-helpers";
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
    const MAX_CLIPS_PER_REQUEST = 20;
    let targetClipIds: string[] = [];
    if (clipIds && clipIds.length > 0) {
      targetClipIds = clipIds.slice(0, MAX_CLIPS_PER_REQUEST);
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
      diagnostic?: string;
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
          .select("id, provider_account_id, handle")
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

        // Token refresh: Instagram long-lived tokens CANNOT be refreshed once
        // expired, so refresh them while still valid but expiring soon (48h
        // window). YouTube/other platforms use standard refresh tokens and
        // refresh after expiry.
        const tokenNeedsRefresh =
          clipPlatform === "Instagram"
            ? isTokenExpiringSoon(connection.expires_at)
            : isTokenExpired(connection.expires_at);

        if (tokenNeedsRefresh) {
          // Instagram uses ig_refresh_token grant — the access token itself is used
          // to generate a new long-lived token. No separate refresh token exists.
          if (clipPlatform === "Instagram") {
            try {
              const provider = getProvider(clipPlatform);
              const refreshed = await provider.refreshToken(accessToken);

              await adminClient
                .from("social_connections")
                .update({
                  access_token_enc: encryptToken(refreshed.accessToken),
                  expires_at: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq("social_account_id", socialAccount.id);

              accessToken = refreshed.accessToken;
            } catch (refreshErr) {
              if (isTokenExpired(connection.expires_at)) {
                // Token already dead — reconnect is the only path.
                await adminClient
                  .from("social_accounts")
                  .update({ status: "connection_error", error: "Token refresh failed — reconnect required" })
                  .eq("id", socialAccount.id)
                  .eq("user_id", clip.user_id);

                results.push({
                  clipId: cid,
                  status: "skipped",
                  error: "Instagram token refresh failed — reconnect the account",
                });
                continue;
              }
              // Pre-expiry refresh failed (e.g. transient network error) but
              // the existing token is still valid — continue with it.
              console.warn(
                `[metrics/sync] Instagram pre-expiry refresh failed clip=${cid.slice(0, 8)} ` +
                `— continuing with existing valid token: ` +
                `${refreshErr instanceof Error ? refreshErr.message : String(refreshErr)}`,
              );
            }
          } else {
            // YouTube and other platforms use separate refresh tokens
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
        }

        // Fetch metrics from the platform
        const metrics = await provider.fetchMetrics(
          clip.video_url,
          accessToken,
          socialAccount.provider_account_id,
        );

        // Ownership verification (fail-closed, shared helper)
        const ownership = verifyMetricOwnership({
          platform: clipPlatform,
          metrics,
          accountProviderId: socialAccount.provider_account_id,
          accountHandle: socialAccount.handle,
        });
        if (!ownership.ok) {
          console.log(
            `[metrics/sync] Ownership rejected clip=${cid.slice(0, 8)} ` +
            `platform=${clipPlatform}: ${ownership.error}`,
          );
          results.push({
            clipId: cid,
            status: "rejected",
            error: ownership.error ?? "Ownership verification failed",
          });
          continue;
        }

        // DIAG LOG: Before ingest_clip_metrics
        console.log("[metrics/sync] before ingest:", JSON.stringify({
          clipId: cid,
          platform: clipPlatform,
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          source: metrics.source,
          verificationStatus: metrics.verificationStatus,
          username: metrics.username,
          channelId: metrics.channelId,
        }));

        // Skip ingest if insights failed — do NOT store views=0 as verified
        if (metrics.verificationStatus !== "verified") {
          console.log("[metrics/sync] skipping ingest — insights not verified:", JSON.stringify({
            clipId: cid,
            verificationStatus: metrics.verificationStatus,
            insightsError: metrics.insightsError ?? null,
          }));
          results.push({
            clipId: cid,
            status: "skipped",
            error: `Insights unavailable (status: ${metrics.verificationStatus}). Metrics not stored.`,
            // Sanitized allowlisted classification (never raw provider text)
            ...(metrics.insightsError ? { diagnostic: metrics.insightsError } : {}),
          });
          continue;
        }

        // Store via the ingest_clip_metrics RPC (service_role-only)
        const { data: ingestResult, error: ingestError } = await adminClient.rpc(
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

        // DIAG LOG: After ingest_clip_metrics
        console.log("[metrics/sync] after ingest:", JSON.stringify({
          clipId: cid,
          ingestError: ingestError?.message ?? null,
          ingestResult,
        }));

        if (ingestError) {
          results.push({ clipId: cid, status: "error", error: sanitizeError(ingestError.message) });
          continue;
        }

        // Record successful sync time (shown as "Last synced" on the
        // accounts page). Best-effort — a failure here must not fail the sync.
        const { error: syncStampErr } = await adminClient
          .from("social_accounts")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", socialAccount.id);
        if (syncStampErr) {
          console.warn(
            `[metrics/sync] last_sync_at update failed for account ` +
            `${socialAccount.id.slice(0, 8)}: ${syncStampErr.message}`,
          );
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
          error: e instanceof Error ? sanitizeError(e.message) : "Sync failed",
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
