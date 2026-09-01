// ---------------------------------------------------------------------------
// POST /api/social/oauth/initiate
// Generates OAuth authorization URL and stores the state parameter for CSRF
// protection. Returns the URL for the client to redirect to.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, isProviderConfigured } from "@/lib/social-providers";
import type { Platform } from "@/lib/types";

const VALID_PLATFORMS: Platform[] = ["Instagram", "YouTube"];

export async function POST(request: Request) {
  try {
    const { platform, redirectTo } = (await request.json()) as {
      platform: Platform;
      redirectTo?: string;
    };

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform" },
        { status: 400 },
      );
    }

    if (!isProviderConfigured(platform)) {
      // Mock mode: return a mock authorization URL
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
      }

      const state = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const provider = getProvider(platform);
      const { authorizationUrl } = provider.getAuthorizationUrl(user.id, state);

      // Store state in DB
      await supabase.from("social_oauth_states").insert({
        user_id: user.id,
        platform,
        state,
        redirect_to: redirectTo ?? "/clipper/accounts",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      return NextResponse.json({ authorizationUrl, mock: true });
    }

    // Real OAuth flow
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const state = `${user.id}_${platform}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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
      redirect_to: redirectTo ?? "/clipper/accounts",
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
