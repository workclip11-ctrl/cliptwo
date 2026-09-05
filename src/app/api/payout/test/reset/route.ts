// ---------------------------------------------------------------------------
// POST /api/payout/test/reset
//
// Deletes ALL test sandbox data for the current admin.
// NEVER touches production tables.
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

    const { data, error } = await client.rpc("payout_test_reset");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ result: data, success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
