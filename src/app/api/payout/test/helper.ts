// ---------------------------------------------------------------------------
// Test Payout Sandbox API Helper
//
// Creates a Supabase client with the authenticated admin's JWT.
// Used by all /api/payout/test/* endpoints.
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";

export async function createTestClient(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    return createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: authHeader },
      },
    });
  }

  // Cookie fallback
  const { createClient: createCookieClient } = await import("@/lib/supabase/server");
  return createCookieClient();
}
