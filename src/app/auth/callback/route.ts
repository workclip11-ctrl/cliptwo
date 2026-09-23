import { NextResponse } from "next/server";

/**
 * Google OAuth callback handler.
 *
 * The PKCE code_verifier is stored in the browser's per-tab sessionStorage
 * and is inaccessible server-side. This route simply forwards the
 * authorization code to /auth/complete, where the browser completes the
 * PKCE exchange using the same per-tab Supabase client that initiated
 * the OAuth flow.
 *
 * It also forwards the validated OAuth onboarding intent
 * (?intent=clipper|creator&nonce=…) set by signInWithGoogle via redirectTo.
 * Only the strict allowlist survives; /auth/complete uses it SOLELY for new
 * users without a profile — existing profiles always win there and in
 * finalize_profile().
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const intent = searchParams.get("intent");
  const nonce = searchParams.get("nonce");

  if (code) {
    const redirectTo = new URL("/auth/complete", origin);
    redirectTo.searchParams.set("code", code);
    if (state) redirectTo.searchParams.set("state", state);
    if (intent === "clipper" || intent === "creator") {
      redirectTo.searchParams.set("intent", intent);
      if (nonce && nonce.length > 0 && nonce.length <= 128) {
        redirectTo.searchParams.set("nonce", nonce);
      }
    }
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
