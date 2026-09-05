// ---------------------------------------------------------------------------
// POST /api/payout/test/balance
//
// Seeds or resets the admin's test sandbox balance.
// Body: { balancePaise?: number } — defaults to 100000 (₹1,000)
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createTestClient } from "../helper";

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const client = await createTestClient(request);
    if (!client) {
      return NextResponse.json({ error: "Test sandbox not configured" }, { status: 503 });
    }

    let balancePaise = 100000; // Default ₹1,000
    try {
      const body = await request.json();
      if (typeof body.balancePaise === "number" && body.balancePaise > 0) {
        balancePaise = body.balancePaise;
      }
    } catch {
      // Use default
    }

    const { data, error } = await client.rpc("payout_test_seed_balance", {
      p_balance_paise: balancePaise,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ balance: data, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
