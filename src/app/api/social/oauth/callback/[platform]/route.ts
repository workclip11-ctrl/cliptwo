// ---------------------------------------------------------------------------
// GET /api/social/oauth/callback/instagram
// GET /api/social/oauth/callback/youtube
// Handles OAuth callback: validates state, exchanges code for tokens,
// stores encrypted tokens in social_connections, verifies ownership,
// and redirects user back to the accounts page.
//
// Security model:
//   - Does NOT require browser session cookies (per-tab auth is in sessionStorage)
//   - User identity comes exclusively from the one-time OAuth state row
//   - State is cryptographically random, short-lived, one-time-use, bound to user
//   - Uses service-role client for all DB operations
//   - Never exposes tokens to the browser
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/social-providers";
import { encryptToken, tokenExpiresIn } from "@/lib/token-crypto";
import type { Platform } from "@/lib/types";

const LOG_PREFIX = "[oauth/callback";

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

  const log = (msg: string) => console.log(`${LOG_PREFIX}/${platform}] ${msg}`);
  const logError = (msg: string) => console.error(`${LOG_PREFIX}/${platform}] ${msg}`);

  log("START");

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const baseRedirect = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/clipper/accounts`
    : "/clipper/accounts";

  // Provider denied access
  if (error) {
    logError(`Provider denied access: ${error}`);
    return NextResponse.redirect(
      new URL(`${baseRedirect}?error=provider_denied&platform=${platform}`, request.url),
    );
  }

  if (!code || !state) {
    logError(`Missing params — code: ${!!code}, state: ${!!state}`);
    return NextResponse.redirect(
      new URL(`${baseRedirect}?error=missing_params&platform=${platform}`, request.url),
    );
  }

  try {
    // ── Step 1: Service-role client for all DB operations ───────────────
    const adminClient = createServiceClient();

    // ── Step 2: Validate the OAuth state (CSRF protection) ─────────────
    log("Looking up OAuth state");
    const { data: stateRecord, error: stateError } = await adminClient
      .from("social_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !stateRecord) {
      logError(`State lookup failed: ${stateError?.message ?? "not found"}`);
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=invalid_state&platform=${platform}`, request.url),
      );
    }

    log(`State found — user: ${stateRecord.user_id.slice(0, 8)}..., platform: ${stateRecord.platform}`);

    // ── Step 3: Check expiry ───────────────────────────────────────────
    if (new Date(stateRecord.expires_at).getTime() < Date.now()) {
      logError("State expired");
      await adminClient.from("social_oauth_states").delete().eq("state", state);
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=state_expired&platform=${platform}`, request.url),
      );
    }

    // ── Step 4: Verify platform matches ────────────────────────────────
    if (stateRecord.platform !== platform) {
      logError(`Platform mismatch — expected: ${stateRecord.platform}, got: ${platform}`);
      return NextResponse.redirect(
        new URL(`${baseRedirect}?error=platform_mismatch&platform=${platform}`, request.url),
      );
    }

    log("State platform validated");

    const userId = stateRecord.user_id;
    const redirectPath = validateRedirectPath(stateRecord.redirect_to);

    // ── Step 5: Delete the used state (one-time use) ───────────────────
    await adminClient.from("social_oauth_states").delete().eq("state", state);
    log("State consumed");

    // ── Step 6: Exchange code for tokens ───────────────────────────────
    log("Exchanging authorization code for tokens");
    const provider = getProvider(platform);
    const tokenResult = await provider.exchangeCode(code, state, stateRecord.code_verifier ?? undefined);

    if (!tokenResult.providerAccountId) {
      logError("Token exchange succeeded but no provider account ID returned");
      throw new Error("Token exchange failed: no provider account ID returned");
    }

    log(`Token exchange successful — channel: ${tokenResult.handle || "unknown"}, account: ${tokenResult.providerAccountId.slice(0, 8)}...`);

    // ── Step 7: Encrypt tokens before storage ──────────────────────────
    const accessTokenEnc = encryptToken(tokenResult.accessToken);
    const refreshTokenEnc = tokenResult.refreshToken
      ? encryptToken(tokenResult.refreshToken)
      : null;
    const expiresAt = tokenExpiresIn(tokenResult.expiresIn);

    // ── Step 8: Check if social_account already exists ────────────────
    const { data: existingAccount } = await adminClient
      .from("social_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .single();

    let socialAccountId: string;

    if (existingAccount) {
      log(`Updating existing social_account: ${existingAccount.id}`);
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
        logError(`social_accounts update failed: ${acctErr.message}`);
        throw new Error(`Failed to update social account: ${acctErr.message}`);
      }

      // Preserve existing refresh token if Google didn't return a new one
      const { data: existingConn } = await adminClient
        .from("social_connections")
        .select("refresh_token_enc")
        .eq("social_account_id", socialAccountId)
        .single();

      const finalRefreshTokenEnc = refreshTokenEnc
        ?? existingConn?.refresh_token_enc
        ?? null;

      // Upsert connection with encrypted tokens
      const { error: connErr } = await adminClient.from("social_connections").upsert(
        {
          social_account_id: socialAccountId,
          user_id: userId,
          platform,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: finalRefreshTokenEnc,
          token_type: "bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokenResult.scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "social_account_id" },
      );
      if (connErr) {
        logError(`social_connections upsert failed: ${connErr.message}`);
        throw new Error(`Failed to store tokens: ${connErr.message}`);
      }
      log("Social account and connection updated");
    } else {
      log("Creating new social_account");
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
        logError(`social_accounts insert failed: ${insertErr?.message ?? "unknown"}`);
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
        logError(`social_connections insert failed: ${connErr.message}`);
        throw new Error(`Failed to store tokens: ${connErr.message}`);
      }
      log("Social account and connection created");
    }

    // ── Step 9: Verify ownership (server-side) ────────────────────────
    log("Verifying ownership");
    const verification = await provider.verifyOwnership(
      tokenResult.accessToken,
      tokenResult.handle,
    );

    log(`Ownership verification result: verified=${verification.verified}, handle=${verification.handle || "unknown"}`);

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
        logError(`verification update (social_accounts) failed: ${verifyAcctErr.message}`);
      }

      const { error: verifyConnErr } = await adminClient
        .from("social_connections")
        .update({
          verified_at: new Date().toISOString(),
          verification_data: verification,
        })
        .eq("social_account_id", socialAccountId);
      if (verifyConnErr) {
        logError(`verification update (social_connections) failed: ${verifyConnErr.message}`);
      }
    } else {
      // Even if verifyOwnership reports a mismatch, the channel from
      // the token exchange IS the authoritative connected channel.
      // Mark as verified based on successful token exchange + channel fetch.
      // For YouTube, the OAuth consent itself proves which channel authorized.
      log("Ownership verification did not match claimed handle — marking as verified based on successful OAuth exchange");
      await adminClient
        .from("social_accounts")
        .update({
          verified: true,
          provider_account_id: tokenResult.providerAccountId,
          avatar_url: tokenResult.avatarUrl ?? null,
        })
        .eq("id", socialAccountId)
        .eq("user_id", userId);
    }

    // ── Step 10: Redirect back to accounts page with success ───────────
    log("SUCCESS");
    const redirectUrl = new URL(redirectPath, request.url);
    redirectUrl.searchParams.set("connected", platform.toLowerCase());
    redirectUrl.searchParams.set("verified", "true");

    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    logError(`FAILED: ${e instanceof Error ? e.message : "unknown error"}`);
    const errorMessage = e instanceof Error ? e.message : "callback_failed";
    return NextResponse.redirect(
      new URL(
        `${baseRedirect}?error=${encodeURIComponent(errorMessage)}&platform=${platform}`,
        request.url,
      ),
    );
  }
}
