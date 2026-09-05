// ---------------------------------------------------------------------------
// POST /api/payout/test/process
//
// Transitions a test payout from pending → processing.
// Body: { requestId: string }
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

    if (!requestId || typeof requestId !== "string") {
      return NextResponse.json({ error: "requestId is required" }, { status: 400 });
    }

    const { data, error } = await client.rpc("payout_test_process_request", {
      p_request_id: requestId,
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
