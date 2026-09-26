import { NextResponse } from "next/server";

/**
 * Google OAuth callback handler.
 *
 * The PKCE code_verifier is stored in the browser's per-tab sessionStorage
 * and is inaccessible server-side. This route therefore does NOT exchange the
 * code itself (that would require the verifier); it forwards the authorization
 * code to /auth/complete, where the browser completes the PKCE exchange using
 * the same per-tab Supabase client that initiated the OAuth flow. No access
 * token or client secret ever appears in a URL.
 *
 * It also forwards the validated OAuth onboarding intent
 * (?intent=clipper|creator&nonce=…) set by signInWithGoogle via redirectTo.
 * Only the strict allowlist survives; /auth/complete uses it SOLELY for new
 * users without a profile — existing profiles always win there and in
 * finalize_profile().
 *
 * Error handling: when the flow fails upstream (user cancelled/denied at
 * Google, provider error, expired link, …) Supabase returns to this route with
 * error / error_code (/ error_description) instead of a code. Those are
 * translated to a FIXED allowlisted code so that:
 *   - raw provider/Supabase text is never reflected into a URL or the page
 *     (no internal details or attacker-controlled content leak to the client),
 *   - the login page can show a specific, useful message per failure class.
 */

// Upstream error (error_code or error) → safe client-facing code.
// Anything unknown collapses to "oauth_failed".
const ERROR_CODE_MAP: Record<string, string> = {
  access_denied: "cancelled", // user cancelled / denied Google consent
  otp_expired: "link_expired", // expired email confirmation or recovery link
  identity_already_exists: "account_exists", // same email, different sign-in method
  provider_email_needs_verification: "email_unverified", // unverified Google email
  signup_disabled: "signup_disabled", // sign-ups turned off in Supabase
};

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

  // No code → the flow failed upstream. Map to a fixed code (never forward
  // error_description or any other upstream text).
  const upstream =
    searchParams.get("error_code") ?? searchParams.get("error") ?? "";
  const errorCode = ERROR_CODE_MAP[upstream] ?? "oauth_failed";

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(errorCode)}`,
  );
}
