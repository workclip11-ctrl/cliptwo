import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const role = searchParams.get("role");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Fetch the authoritative role from the profiles table (never trust
      // user_metadata for role routing — profiles.role is the source of truth).
      let userRole: string | null = null;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.role) userRole = profile.role;
        }
      } catch {
        /* non-fatal — fall through to role param */
      }

      // Redirect to /auth/complete with ONLY the resolved role.
      // Tokens are NOT passed in the URL — the client will fetch them
      // from /api/auth/session using the HTTP-only cookies set above.
      const redirectTo = new URL("/auth/complete", origin);
      redirectTo.searchParams.set("role", userRole ?? role ?? "clipper");
      return NextResponse.redirect(redirectTo);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
