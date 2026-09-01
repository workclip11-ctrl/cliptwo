// ---------------------------------------------------------------------------
// GET /api/social/oauth/callback/instagram
// GET /api/social/oauth/callback/youtube
// Handles OAuth callback: validates state, exchanges code for tokens,
// stores encrypted tokens in social_connections, verifies ownership,
// and redirects user back to the accounts page.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-providers";
import { encryptToken, tokenExpiresIn } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

function getPlatform(pathname: string): Platform | null {
  if (pathname.includes("/instagram")) return "Instagram";
  if (pathname.includes("/youtube")) return "YouTube";
  return null;
}

export async function GET(request: NextRequest) {
  const platform = getPlatform(request.nextUrl.pathname);
  if (!platform) {
    return NextResponse.redirect(new URL("/clipper/accounts?error=unknown_platform", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const baseRedirect = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/clipper/accounts`
    : "/clipper/accounts";

  // Provider denied access
  if (error) {
    return NextResponse.redirect(
      new URL(`${baseRedirect}?error=provider_denied&platform=${platform}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`${baseRedirect}?error=missing_params&platform=${platform}`, request.url),
    );
  }

  try {
    const supabase = await createClient();

    // 1. Validate the OAuth state (CSRF protection)
    const { data: stateRecord, error: stateError } = await supabase
      .from("social_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !stateRecord) {
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=invalid_state&platform=${platform}`, request.url),
      );
    }

    // Check expiry
    if (new Date(stateRecord.expires_at).getTime() < Date.now()) {
      // Clean up expired state
      await supabase.from("social_oauth_states").delete().eq("state", state);
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=state_expired&platform=${platform}`, request.url),
      );
    }

    const userId = stateRecord.user_id;
    const redirectPath = stateRecord.redirect_to ?? "/clipper/accounts";

    // Delete the used state (one-time use)
    await supabase.from("social_oauth_states").delete().eq("state", state);

    // 2. Exchange code for tokens
    const provider = getProvider(platform);
    const tokenResult = await provider.exchangeCode(code, state);

    // 3. Encrypt tokens before storage
    const accessTokenEnc = encryptToken(tokenResult.accessToken);
    const refreshTokenEnc = tokenResult.refreshToken
      ? encryptToken(tokenResult.refreshToken)
      : null;
    const expiresAt = tokenExpiresIn(tokenResult.expiresIn);

    // 4. Check if social_account already exists for this user+platform
    const { data: existingAccount } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    let socialAccountId: string;

    if (existingAccount) {
      // Update existing account
      socialAccountId = existingAccount.id;
      await supabase
        .from("social_accounts")
        .update({
          handle: tokenResult.handle,
          provider_account_id: tokenResult.providerAccountId,
          avatar_url: tokenResult.avatarUrl ?? null,
          status: "connected",
          connected_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", socialAccountId);

      // Update or create connection
      await supabase.from("social_connections").upsert(
        {
          social_account_id: socialAccountId,
          user_id: userId,
          platform,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          token_type: "bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokenResult.scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "social_account_id" },
      );
    } else {
      // Create new social account
      const { data: newAccount } = await supabase
        .from("social_accounts")
        .insert({
          user_id: userId,
          platform,
          handle: tokenResult.handle,
          provider_account_id: tokenResult.providerAccountId,
          avatar_url: tokenResult.avatarUrl ?? null,
          status: "connected",
          connected_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!newAccount) {
        throw new Error("Failed to create social account");
      }

      socialAccountId = newAccount.id;

      // Create connection with encrypted tokens
      await supabase.from("social_connections").insert({
        social_account_id: socialAccountId,
        user_id: userId,
        platform,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_type: "bearer",
        expires_at: expiresAt.toISOString(),
        scope: tokenResult.scope,
      });
    }

    // 5. Verify ownership (server-side)
    const verification = await provider.verifyOwnership(
      tokenResult.accessToken,
      tokenResult.handle,
    );

    if (verification.verified) {
      await supabase
        .from("social_accounts")
        .update({
          verified: true,
          provider_account_id: verification.providerAccountId,
          avatar_url: verification.avatarUrl ?? null,
        })
        .eq("id", socialAccountId);

      await supabase
        .from("social_connections")
        .update({
          verified_at: new Date().toISOString(),
          verification_data: verification,
        })
        .eq("social_account_id", socialAccountId);
    }

    // 6. Redirect back to accounts page with success
    const redirectUrl = new URL(redirectPath, request.url);
    redirectUrl.searchParams.set("connected", platform.toLowerCase());
    redirectUrl.searchParams.set("verified", verification.verified ? "true" : "false");

    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    console.error(`[oauth/callback/${platform}]`, e);
    const errorMessage = e instanceof Error ? e.message : "callback_failed";
    return NextResponse.redirect(
      new URL(
        `${baseRedirect}?error=${encodeURIComponent(errorMessage)}&platform=${platform}`,
        request.url,
      ),
    );
  }
}
