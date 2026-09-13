import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Fetch the authoritative role from the profiles table (never trust
      // user_metadata for role routing — profiles.role is the source of truth).
      let userRole: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (profile?.role) userRole = profile.role;
      } catch {
        /* non-fatal — fall through to role param */
      }

      const redirectTo = new URL("/auth/complete", origin);
      redirectTo.searchParams.set("access_token", data.session.access_token);
      redirectTo.searchParams.set("refresh_token", data.session.refresh_token);
      redirectTo.searchParams.set("role", userRole ?? role ?? "clipper");
      return NextResponse.redirect(redirectTo);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
