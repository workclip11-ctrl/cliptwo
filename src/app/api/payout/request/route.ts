// ---------------------------------------------------------------------------
// POST /api/payout/request
//
// Server-side payout request handler.
// 1. Authenticates via Bearer token (per-tab) or cookie fallback
// 2. Calls request_payout() RPC which:
//    - Reads user ID from auth.uid()
//    - Reads verified UPI from profiles
//    - Calculates authoritative balance from financial_records + payout_requests
//    - Enforces minimum threshold
//    - Checks no duplicate processing payout
//    - Creates payout record atomically
//
// Cliptwo uses MANUAL QR/UPI payments. There is no automated payment provider.
// Admin reviews payout requests and manually processes UPI transfers.
//
// The browser NEVER sees API credentials. All financial logic is server-side.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Use service-role client to call request_payout() RPC
    // The RPC uses auth.uid() internally — we need to set the auth context
    // Since request_payout() uses auth.uid(), we call it via a client that
    // has the user's session. For Bearer auth, we use the service-role client
    // but the RPC must work with the authenticated user.
    //
    // Actually, request_payout() uses auth.uid() which reads from the JWT.
    // With service-role, auth.uid() returns the service role user, not the
    // actual user. We need to use the anon client with the user's token.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Payment system not configured" },
        { status: 503 },
      );
    }

    // Try Bearer token first
    const authHeader = request.headers.get("authorization");
    let rpcClient;

    if (authHeader?.startsWith("Bearer ")) {
      const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
      rpcClient = createSupabaseClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: {
          headers: { Authorization: authHeader },
        },
      });
    } else {
      // Fallback: cookie-based (import from server.ts)
      const { createClient } = await import("@/lib/supabase/server");
      rpcClient = await createClient();
    }

    // Call request_payout() RPC — all validation happens server-side
    const { data, error: rpcError } = await rpcClient.rpc("request_payout");

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message ?? "Payout request failed" },
        { status: 400 },
      );
    }

    return NextResponse.json({ payout: data, success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
