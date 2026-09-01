// ---------------------------------------------------------------------------
// POST /api/payout/webhook
//
// Handles payment provider webhooks for payout status updates.
// Providers send status updates (completed, failed) to this endpoint.
//
// Security:
// - Verifies webhook signature using provider-specific logic
// - Only processes trusted events
// - Updates payout state only via server-side RPC
// - Idempotent: duplicate webhooks are safely ignored
//
// The browser NEVER sees this endpoint. Providers call it directly.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPaymentProvider } from "@/lib/payment-provider";

// Server-only Supabase client (uses service_role key for webhook processing)
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Verify webhook signature
    const provider = getPaymentProvider();
    const isValid = provider.verifyWebhook(body);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2. Extract event data
    const { event, providerRef, payoutId, amount } = body as {
      event: string;
      providerRef: string;
      payoutId: string;
      amount: number;
    };

    if (!payoutId || !event) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // 3. Get server-side Supabase client
    const supabase = getServerSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Payment system not configured" },
        { status: 503 },
      );
    }

    // 4. Process webhook event via server-side RPC only
    if (event === "payout.completed") {
      const { error } = await supabase.rpc("complete_payout", {
        p_payout_id: payoutId,
        p_provider_ref: providerRef,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (event === "payout.failed") {
      const { error } = await supabase.rpc("fail_payout", {
        p_payout_id: payoutId,
        p_reason: body.reason ?? "Provider reported failure",
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Unknown event type" }, { status: 400 });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
