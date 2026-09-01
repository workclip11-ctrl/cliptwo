// ---------------------------------------------------------------------------
// POST /api/payout/request
//
// Server-side payout request handler.
// 1. Authenticates via Supabase session (server-side cookie)
// 2. Calls request_payout() RPC which:
//    - Reads user ID from auth.uid()
//    - Reads verified UPI from profiles
//    - Calculates authoritative balance from wallet_ledger
//    - Enforces minimum threshold
//    - Checks no duplicate processing payout
//    - Creates payout record + debit ledger entry atomically
// 3. Optionally triggers payment provider
//
// The browser NEVER sees API credentials. All financial logic is server-side.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPaymentProvider } from "@/lib/payment-provider";

export async function POST(request: Request) {
  try {
    // 1. Create server-side Supabase client with session cookie
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Payment system not configured" },
        { status: 503 },
      );
    }

    // Read session from request cookies
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

    // 2. Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // 3. Call request_payout() RPC — all validation happens server-side
    const { data, error: rpcError } = await supabase.rpc("request_payout");

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message ?? "Payout request failed" },
        { status: 400 },
      );
    }

    const payout = data;

    // 4. If provider is not mock, initiate real payout
    const providerName = process.env.PAYMENT_PROVIDER ?? "mock";
    if (providerName !== "mock" && payout?.id) {
      const provider = getPaymentProvider();
      const response = await provider.initiatePayout({
        payoutId: payout.id,
        amount: payout.net_amount,
        currency: payout.currency ?? "INR",
        upiId: payout.upi_id ?? "",
        idempotencyKey: payout.idempotency_key ?? `payout-${payout.id}`,
        metadata: payout.metadata ?? {},
      });

      if (response.status === "completed" && response.providerRef) {
        // Mark as processing (provider accepted)
        await supabase.rpc("process_payout", {
          p_payout_id: payout.id,
          p_provider: providerName,
        });
      } else if (response.status === "failed") {
        // Mark as failed
        await supabase.rpc("fail_payout", {
          p_payout_id: payout.id,
          p_reason: response.error ?? "Provider rejected payout",
        });
      }
    }

    return NextResponse.json({ payout, success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
