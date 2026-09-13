import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Returns the current session for the authenticated user.
 *
 * Used by /auth/complete to securely hand off the session from the server
 * (HTTP-only cookies) to the browser (per-tab sessionStorage) without
 * exposing tokens in the URL.
 *
 * The response body contains access_token and refresh_token — these are
 * transmitted over HTTPS only and never appear in browser history, server
 * logs, or referrer headers.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "No active session" },
        { status: 401 },
      );
    }

    // Fetch the authoritative role from the profiles table.
    // profiles.role is the SOLE source of truth — never trust user_metadata.
    let role = "clipper";
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.role) role = profile.role;
    } catch {
      /* non-fatal — defaults to "clipper" */
    }

    return NextResponse.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      role,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 },
    );
  }
}
