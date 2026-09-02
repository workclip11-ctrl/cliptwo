// ---------------------------------------------------------------------------
// POST /api/social/oauth/initiate
// Generates OAuth authorization URL and stores the state parameter for CSRF
// protection. Returns the URL for the client to redirect to.
//
// Supported platforms: Instagram, YouTube.
// Kick: returns 400 with "not available" message.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform. Only Instagram and YouTube are supported for OAuth." },
        { status: 400 },
      );
    }

    if (!isProviderConfigured(platform)) {
      return NextResponse.json(
        {
          error: `${platform} OAuth is not configured. Set ${platform === "Instagram" ? "INSTAGRAM_CLIENT_ID/SECRET" : "YOUTUBE_CLIENT_ID/SECRET"} environment variables.`,
        },
        { status: 503 },
      );
    }

    // Real OAuth flow
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Cryptographically random state: user-bound, platform-bound, expires in 10min
    const state = `${user.id}_${platform}_${Date.now()}_${crypto.randomUUID()}`;
    const provider = getProvider(platform);

    // YouTube requires async PKCE code_challenge generation
    const authResult = provider.getAuthorizationUrlAsync
      ? await provider.getAuthorizationUrlAsync(user.id, state)
      : provider.getAuthorizationUrl(user.id, state);

    const { authorizationUrl, codeVerifier } = authResult;

    // Store state + optional PKCE verifier in DB
    await supabase.from("social_oauth_states").insert({
      user_id: user.id,
      platform,
      state,
      code_verifier: codeVerifier ?? null,
      redirect_to: validateRedirectTo(redirectTo),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    return NextResponse.json({ authorizationUrl });
  } catch (e) {
    console.error("[oauth/initiate]", e);
    return NextResponse.json(
      { error: "Failed to initiate OAuth" },
      { status: 500 },
    );
  }
}
