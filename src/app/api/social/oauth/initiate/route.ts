// ---------------------------------------------------------------------------
// POST /api/social/oauth/initiate
// Generates OAuth authorization URL and stores the state parameter for CSRF
// protection. Returns the URL for the client to redirect to.
//
// Supported platforms: Instagram, YouTube.
// Kick: returns 400 with "not available" message.
//
// Security model:
//   - Authenticates user via Bearer access token from per-tab browser session
//   - Falls back to cookie-based auth for non-browser callers
//   - Uses service-role client for social_oauth_states insert (RLS removed)
//   - Never exposes service-role key to the browser
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider, isProviderConfigured } from "@/lib/social-providers";
import type { Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = ["Instagram", "YouTube"];

function validateRedirectTo(redirectTo: string | undefined): string {
  if (!redirectTo) return "/clipper/accounts";

  // Only allow relative paths
  if (redirectTo.startsWith("http://") || redirectTo.startsWith("https://")) {
    return "/clipper/accounts";
  }

  // Ensure it starts with /
  if (!redirectTo.startsWith("/")) {
    return "/clipper/accounts";
  }

  return redirectTo;
}

export async function POST(request: Request) {
  try {
    const { platform, redirectTo } = (await request.json()) as {
      platform: Platform;
      redirectTo?: string;
    };

    console.log(`[oauth/initiate] Starting OAuth for platform: ${platform}`);

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform. Only Instagram and YouTube are supported for OAuth." },
        { status: 400 },
      );
    }

    if (!isProviderConfigured(platform)) {
      console.error(`[oauth/initiate] ${platform} provider not configured — missing environment variables`);
      return NextResponse.json(
        {
          error: `${platform} OAuth is not configured. Set ${platform === "Instagram" ? "INSTAGRAM_CLIENT_ID/SECRET" : "YOUTUBE_CLIENT_ID/SECRET"} environment variables.`,
        },
        { status: 503 },
      );
    }

    // ── Step 1: Authenticate the user ──────────────────────────────────
    // Supports per-tab browser sessions via Bearer token AND cookie-based
    // auth for Vercel cron / server-side callers.
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      console.error("[oauth/initiate] Authentication failed — no valid session or token");
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    console.log(`[oauth/initiate] Authenticated user: ${authUser.id}`);

    // ── Step 2: Service-role client for trusted DB operations ───────────
    const adminClient = createServiceClient();

    // ── Step 3: Generate cryptographically random state ─────────────────
    const state = `${authUser.id}_${platform}_${Date.now()}_${crypto.randomUUID()}`;
    const provider = getProvider(platform);

    // YouTube requires async PKCE code_challenge generation
    const authResult = provider.getAuthorizationUrlAsync
      ? await provider.getAuthorizationUrlAsync(authUser.id, state)
      : provider.getAuthorizationUrl(authUser.id, state);

    const { authorizationUrl, codeVerifier } = authResult;

    console.log(`[oauth/initiate] Generated state, PKCE: ${codeVerifier ? "yes" : "no"}`);

    // ── Step 4: Store state + optional PKCE verifier via service-role ───
    const { error: stateError } = await adminClient
      .from("social_oauth_states")
      .insert({
        user_id: authUser.id,
        platform,
        state,
        code_verifier: codeVerifier ?? null,
        redirect_to: validateRedirectTo(redirectTo),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

    if (stateError) {
      console.error("[oauth/initiate] Failed to store OAuth state:", stateError.message);
      return NextResponse.json(
        { error: "Failed to initiate OAuth: could not store state" },
        { status: 500 },
      );
    }

    console.log(`[oauth/initiate] OAuth state stored, returning authorization URL`);

    return NextResponse.json({ authorizationUrl });
  } catch (e) {
    console.error("[oauth/initiate] Unexpected error:", e);
    return NextResponse.json(
      { error: "Server OAuth configuration is incomplete." },
      { status: 500 },
    );
  }
}
