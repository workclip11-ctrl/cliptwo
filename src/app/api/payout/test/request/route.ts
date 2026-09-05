// ---------------------------------------------------------------------------
// POST /api/payout/test/request
//
// Creates a test payout request from the sandbox balance.
// Body: { amountPaise: number, upiId?: string }
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

    const body = await request.json();
    const amountPaise = body.amountPaise;
    const upiId = body.upiId ?? "test-user@upi";

    if (typeof amountPaise !== "number" || amountPaise <= 0) {
      return NextResponse.json({ error: "amountPaise must be a positive number" }, { status: 400 });
    }

    const { data, error } = await client.rpc("payout_test_create_request", {
      p_amount_paise: amountPaise,
      p_upi_id: upiId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ request: data, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
