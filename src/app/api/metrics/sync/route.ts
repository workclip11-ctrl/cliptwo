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
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
import { decryptToken, isTokenExpired } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { clipId, clipIds, platform } = (await request.json()) as {
      clipId?: string;
      clipIds?: string[];
      platform?: Platform;
    };

    const supabase = await createClient();

    // Verify admin or service_role
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

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

    const adminClient = createServiceClient();

    for (const cid of targetClipIds) {
      try {
        // Get clip details
        const { data: clip, error: clipError } = await supabase
          .from("clips")
          .select("id, platform, video_url, user_id")
          .eq("id", cid)
          .single();

        if (clipError || !clip) {
          results.push({ clipId: cid, status: "error", error: "Clip not found" });
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
          .select("id")
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

        if (isTokenExpired(connection.expires_at)) {
          results.push({
            clipId: cid,
            status: "skipped",
            error: `${clipPlatform} token expired — reconnect the account`,
          });
          continue;
        }

        const accessToken = decryptToken(connection.access_token_enc);

        // Fetch metrics from the platform
        const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

        // Store via the ingest_clip_metrics RPC
        const { error: ingestError } = await supabase.rpc(
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
