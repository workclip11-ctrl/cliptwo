// ---------------------------------------------------------------------------
// POST /api/payout/webhook
//
// Reserved for future payment provider webhooks. Currently a no-op since
// Cliptwo uses manual QR/UPI payments with admin-recorded references.
//
// When a real payment provider is integrated, this endpoint will:
// - Verify webhook signature using provider-specific logic
// - Process payout.completed / payout.failed events
// - Update payout state only via server-side RPC
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";

export async function POST() {
  // No automated payment provider is configured.
  // Admin manually marks payouts as paid via the admin dashboard.
  return NextResponse.json(
    { error: "Webhook processing not available — manual UPI payments only" },
    { status: 501 },
  );
}
