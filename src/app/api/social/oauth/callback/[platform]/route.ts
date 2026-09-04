// ---------------------------------------------------------------------------
// GET /api/social/oauth/callback/instagram
// GET /api/social/oauth/callback/youtube
// Handles OAuth callback: validates state, exchanges code for tokens,
// stores encrypted tokens in social_connections, verifies ownership,
// and redirects user back to the accounts page.
//
// Security model:
//   - Authenticates user via normal Supabase auth client
//   - Uses service-role client for social_accounts/social_connections/social_oauth_states
//     (RLS policies were removed; these operations require elevated access)
//   - Verifies state ownership (state.user_id === authenticated user)
//   - Never exposes tokens to the browser
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-providers";
import { encryptToken, tokenExpiresIn } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

function getPlatform(pathname: string): Platform | null {
  if (pathname.includes("/instagram")) return "Instagram";
  if (pathname.includes("/youtube")) return "YouTube";
  if (pathname.includes("/kick")) return "Kick";
  return null;
}

function validateRedirectPath(path: string): string {
  if (!path) return "/clipper/accounts";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return "/clipper/accounts";
  }
  if (!path.startsWith("/")) {
    return "/clipper/accounts";
  }
  return path;
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
    // ── Step 1: Authenticate the user ──────────────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=not_authenticated&platform=${platform}`, request.url),
      );
    }

    // ── Step 2: Service-role client for trusted DB operations ───────────
    // RLS policies on social_accounts, social_connections, social_oauth_states
    // have been removed. This endpoint is a trusted server route that must
    // use elevated access after verifying the user.
    const adminClient = createServiceClient();

    // ── Step 3: Validate the OAuth state (CSRF protection) ─────────────
    const { data: stateRecord, error: stateError } = await adminClient
      .from("social_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !stateRecord) {
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=invalid_state&platform=${platform}`, request.url),
      );
    }

    // ── Step 4: Verify state ownership ─────────────────────────────────
    // The state must belong to the authenticated user.
    // Do NOT consume another user's OAuth state.
    if (stateRecord.user_id !== user.id) {
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=invalid_state&platform=${platform}`, request.url),
      );
    }

    // ── Step 5: Check expiry ───────────────────────────────────────────
    if (new Date(stateRecord.expires_at).getTime() < Date.now()) {
      await adminClient.from("social_oauth_states").delete().eq("state", state);
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=state_expired&platform=${platform}`, request.url),
      );
    }

    const userId = stateRecord.user_id;
    const redirectPath = validateRedirectPath(stateRecord.redirect_to);

    // ── Step 6: Verify platform matches ────────────────────────────────
    if (stateRecord.platform !== platform) {
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=platform_mismatch&platform=${platform}`, request.url),
      );
    }

    // ── Step 7: Delete the used state (one-time use) ───────────────────
    await adminClient.from("social_oauth_states").delete().eq("state", state);

    // ── Step 8: Exchange code for tokens ───────────────────────────────
    const provider = getProvider(platform);
    const tokenResult = await provider.exchangeCode(code, state);

    // ── Step 9: Encrypt tokens before storage ──────────────────────────
    const accessTokenEnc = encryptToken(tokenResult.accessToken);
    const refreshTokenEnc = tokenResult.refreshToken
      ? encryptToken(tokenResult.refreshToken)
      : null;
    const expiresAt = tokenExpiresIn(tokenResult.expiresIn);

    // ── Step 10: Check if social_account already exists ────────────────
    const { data: existingAccount } = await adminClient
      .from("social_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    let socialAccountId: string;

    if (existingAccount) {
      // Update existing account
      socialAccountId = existingAccount.id;
      const { error: acctErr } = await adminClient
        .from("social_accounts")
        .update({
          handle: tokenResult.handle,
          provider_account_id: tokenResult.providerAccountId,
          avatar_url: tokenResult.avatarUrl ?? null,
          status: "connected",
          connected_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", socialAccountId)
        .eq("user_id", userId);
      if (acctErr) {
        console.error(`[oauth/callback/${platform}] social_accounts update failed:`, acctErr.message);
        throw new Error(`Failed to update social account: ${acctErr.message}`);
      }

      // Upsert connection with encrypted tokens
      const { error: connErr } = await adminClient.from("social_connections").upsert(
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
      if (connErr) {
        console.error(`[oauth/callback/${platform}] social_connections upsert failed:`, connErr.message);
        throw new Error(`Failed to store tokens: ${connErr.message}`);
      }
    } else {
      // Create new social account
      const { data: newAccount, error: insertErr } = await adminClient
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

      if (insertErr || !newAccount) {
        throw new Error(`Failed to create social account: ${insertErr?.message ?? "unknown"}`);
      }

      socialAccountId = newAccount.id;

      // Create connection with encrypted tokens
      const { error: connErr } = await adminClient.from("social_connections").insert({
        social_account_id: socialAccountId,
        user_id: userId,
        platform,
        access_token_enc: accessTokenEnc,
        refresh_token_enc: refreshTokenEnc,
        token_type: "bearer",
        expires_at: expiresAt.toISOString(),
        scope: tokenResult.scope,
      });
      if (connErr) {
        console.error(`[oauth/callback/${platform}] social_connections insert failed:`, connErr.message);
        throw new Error(`Failed to store tokens: ${connErr.message}`);
      }
    }

    // ── Step 11: Verify ownership (server-side) ────────────────────────
    const verification = await provider.verifyOwnership(
      tokenResult.accessToken,
      tokenResult.handle,
    );

    if (verification.verified) {
      const { error: verifyAcctErr } = await adminClient
        .from("social_accounts")
        .update({
          verified: true,
          provider_account_id: verification.providerAccountId,
          avatar_url: verification.avatarUrl ?? null,
        })
        .eq("id", socialAccountId)
        .eq("user_id", userId);
      if (verifyAcctErr) {
        console.error(`[oauth/callback/${platform}] verification update failed:`, verifyAcctErr.message);
      }

      const { error: verifyConnErr } = await adminClient
        .from("social_connections")
        .update({
          verified_at: new Date().toISOString(),
          verification_data: verification,
        })
        .eq("social_account_id", socialAccountId);
      if (verifyConnErr) {
        console.error(`[oauth/callback/${platform}] connection verification update failed:`, verifyConnErr.message);
      }
    }

    // ── Step 12: Redirect back to accounts page with success ───────────
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
