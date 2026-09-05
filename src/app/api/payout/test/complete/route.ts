// ---------------------------------------------------------------------------
// POST /api/payout/test/complete
//
// Transitions a test payout from processing → paid.
// Requires UTR starting with "TEST-" prefix.
// Body: { requestId: string, paymentReference: string }
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
    const requestId = body.requestId;
    const paymentReference = body.paymentReference;

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    if (!paymentReference || typeof paymentReference !== "string") {
      return NextResponse.json({ error: "paymentReference (TEST-UTR) is required" }, { status: 400 });
    }

    if (!paymentReference.trim().startsWith("TEST-")) {
      return NextResponse.json({ error: 'Test UTR must begin with "TEST-" prefix' }, { status: 400 });
    }

    const { data, error } = await client.rpc("payout_test_complete_request", {
      p_request_id: requestId,
      p_payment_reference: paymentReference.trim(),
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
