// ---------------------------------------------------------------------------
// Server-side authentication helper for per-tab browser sessions.
//
// Browser auth uses per-tab sessionStorage (unique storageKey), so server
// cookie-based auth (createClient from server.ts) cannot see the browser
// session. Instead, browser → server API requests send the current tab's
// Supabase access token as: Authorization: Bearer <access_token>.
//
// This helper verifies that token server-side with Supabase and returns
// the authenticated user.
//
// Falls back to cookie-based auth if no Authorization header is present,
// so routes remain compatible with any callers that still use cookies.
// ---------------------------------------------------------------------------

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "./server";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Extract and verify the authenticated user from a request.
 *
 * Priority:
 * 1. Authorization: Bearer <access_token> → verify with Supabase
 * 2. Fallback: cookie-based server client (for Vercel cron, etc.)
 *
 * Returns the authenticated user, or null if unauthenticated.
 */
export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser | null> {
  // ── 1. Check Bearer token ──────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.slice(7);

    if (accessToken) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          console.error("[auth-helpers] Supabase env vars missing");
          return null;
        }

        // Create a temporary Supabase client with the access token.
        // getUser() verifies the JWT against Supabase Auth and returns
        // the user if the token is valid and not expired.
        const tempClient = createSupabaseClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data, error } = await tempClient.auth.getUser(accessToken);

        if (error || !data?.user) {
          console.error("[auth-helpers] Bearer token verification failed:", error?.message);
          return null;
        }

        const user = data.user;
        return { id: user.id, email: user.email ?? "" };
      } catch (e) {
        console.error("[auth-helpers] Bearer token verification error:", e);
        return null;
      }
    }
  }

  // ── 2. Fallback: cookie-based auth ──────────────────────────────────
  try {
    const supabase = await createCookieClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return { id: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
}
