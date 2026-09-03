// ---------------------------------------------------------------------------
// POST /api/payout/request
//
// Server-side payout request handler.
// 1. Authenticates via Supabase session (server-side cookie)
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
import { createServerClient } from "@supabase/ssr";

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Payment system not configured" },
        { status: 503 },
      );
    }

    const cookieHeader = request.headers.get("cookie") ?? "";

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          if (!cookieHeader) return [];
          return cookieHeader.split(";").map((c) => {
            const [name, ...rest] = c.trim().split("=");
            return { name: name ?? "", value: rest.join("=") };
          });
        },
        setAll() {},
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Call request_payout() RPC — all validation happens server-side
    const { data, error: rpcError } = await supabase.rpc("request_payout");

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
