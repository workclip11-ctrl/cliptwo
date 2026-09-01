// ---------------------------------------------------------------------------
// POST /api/metrics/sync
// Triggers metric synchronization for a clip or batch of clips.
// Fetches verified metrics from the platform API and stores them via
// the ingest_clip_metrics() RPC.
//
// In development (mock mode), metrics are stored with source='mock' and
// verification_status='pending' — they are NEVER used for earnings.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetricProvider, isMetricProviderConfigured } from "@/lib/metric-providers";
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
      error?: string;
    }> = [];

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

        const provider = getMetricProvider(clipPlatform);
        const mockMode = !isMetricProviderConfigured(clipPlatform);

        // In production, get the access token from social_connections
        // For now, use mock token
        const accessToken = mockMode ? "mock_token" : "";

        // Fetch metrics from the platform
        const metrics = await provider.fetchMetrics(clip.video_url, accessToken);

        // Store via the ingest_clip_metrics RPC
        // Mock metrics: source='mock', verification_status='pending'
        // Real metrics: source='platform_api', verification_status='verified'
        const { data: ingestResult, error: ingestError } = await supabase.rpc(
          "ingest_clip_metrics",
          {
            p_clip_id: cid,
            p_views: metrics.views,
            p_likes: metrics.likes,
            p_comments: metrics.comments,
            p_shares: metrics.shares,
            p_source: metrics.source === "mock" ? "mock" : "platform_api",
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

    return NextResponse.json({
      success: true,
      mockMode: !isMetricProviderConfigured(platform ?? "Instagram"),
      results,
    });
  } catch (e) {
    console.error("[metrics/sync]", e);
    return NextResponse.json(
      { error: "Metric sync failed" },
      { status: 500 },
    );
  }
}
