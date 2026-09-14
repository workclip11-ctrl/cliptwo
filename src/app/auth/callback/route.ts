import { NextResponse } from "next/server";

/**
 * Google OAuth callback handler.
 *
 * The PKCE code_verifier is stored in the browser's per-tab sessionStorage
 * and is inaccessible server-side. This route simply forwards the
 * authorization code to /auth/complete, where the browser completes the
 * PKCE exchange using the same per-tab Supabase client that initiated
 * the OAuth flow.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const redirectTo = new URL("/auth/complete", origin);
    redirectTo.searchParams.set("code", code);
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
