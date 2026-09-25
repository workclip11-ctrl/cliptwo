import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-helpers";
import { normalizeIndianPhone } from "@/lib/phone";
import { CASHFREE_API_VERSION, getCashfreeConfig } from "@/lib/cashfree";

interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  payment_session_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Environment-driven Cashfree configuration — fail closed when the
  // environment is missing/invalid (no silent sandbox fallback).
  const cashfree = getCashfreeConfig();
  if (!cashfree) {
    console.error(
      "[cashfree] Payment configuration invalid: CASHFREE_ENVIRONMENT must be explicitly " +
      "'production' or 'sandbox' (production builds require 'production') and " +
      "CASHFREE_APP_ID/CASHFREE_SECRET_KEY must be set",
    );
    return NextResponse.json(
      { error: "Payment gateway not configured" },
      { status: 503 },
    );
  }
  const { baseUrl: CASHFREE_BASE_URL, appId, secretKey, environment } = cashfree;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    console.error("[cashfree] NEXT_PUBLIC_APP_URL not configured");
    return NextResponse.json(
      { error: "Application URL not configured" },
      { status: 503 },
    );
  }

  const body = await request.json();
  const { campaignId } = body;

  if (!campaignId) {
    return NextResponse.json(
      { error: "campaignId is required" },
      { status: 400 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "creator" || profile.status !== "active") {
    return NextResponse.json(
      { error: "Only active creators can create payment orders" },
      { status: 403 },
    );
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, budget, status, title, created_by, launch_payment_status")
    .eq("id", campaignId)
    .eq("created_by", user.id)
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found or access denied" },
      { status: 404 },
    );
  }

  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: "Cashfree payment is only available for draft campaigns" },
      { status: 400 },
    );
  }

  let phone: string | undefined;
  try {
    const serviceClient = createServiceClient();
    const { data: authUser } = await serviceClient.auth.admin.getUserById(user.id);
    phone = authUser?.user?.phone;
  } catch (err) {
    console.error("[cashfree] Service-role phone lookup failed:", err);
  }

  if (!phone) {
    return NextResponse.json(
      { error: "A valid phone number is required for Cashfree payments. Please add a phone number to your account." },
      { status: 400 },
    );
  }

  // Normalize to canonical +91XXXXXXXXXX, then derive 10-digit Cashfree phone.
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "Stored phone number is not a valid Indian mobile number." },
      { status: 400 },
    );
  }
  const cashfreePhone = normalizedPhone.slice(3);

  // ── Step 1: Atomically reserve payment attempt (DB-authoritative) ────
  const { data: reserveResult, error: reserveError } = await supabase.rpc(
    "reserve_cashfree_payment_attempt",
    { p_campaign_id: campaignId },
  );

  if (reserveError) {
    console.error("[cashfree] Reserve error:", reserveError);
    return NextResponse.json(
      { error: sanitizeError(reserveError.message) },
      { status: 400 },
    );
  }

  const orderId = reserveResult.order_id as string;
  const paymentSessionId = reserveResult.payment_session_id as string | null;

  // If reused, we have two cases:
  // A) Already confirmed (submitted with session_id) — return it
  // B) Still reserving (no session_id) — need to reconcile with Cashfree
  if (reserveResult.reused) {
    if (paymentSessionId) {
      // Case A: Already has a session — return it
      return NextResponse.json({
        success: true,
        payment_session_id: paymentSessionId,
        order_id: orderId,
        amount: Number(campaign.budget) * 1.1,
        currency: "INR",
        reused: true,
        attempt_number: reserveResult.attempt_number,
        // Server-authoritative SDK mode for the browser checkout
        environment,
      });
    }

    // Case B: Existing 'reserving' reservation without session.
    // This means a previous request created the Cashfree order but failed
    // before confirming. Reconcile by fetching the existing order from Cashfree.
    console.log(`[cashfree] Reconciling existing reservation for order ${orderId}`);

    try {
      const reconcileResponse = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": CASHFREE_API_VERSION,
        },
      });

      if (reconcileResponse.ok) {
        const orderData: CashfreeOrderResponse = await reconcileResponse.json();

        if (orderData.payment_session_id) {
          // Cashfree recognizes the order — confirm with existing session
          const { error: confirmError } = await supabase.rpc(
            "confirm_cashfree_payment_attempt",
            {
              p_campaign_id: campaignId,
              p_cashfree_payment_session_id: orderData.payment_session_id,
            },
          );

          if (!confirmError) {
            return NextResponse.json({
              success: true,
              payment_session_id: orderData.payment_session_id,
              order_id: orderData.order_id,
              cf_order_id: orderData.cf_order_id,
              amount: Number(campaign.budget) * 1.1,
              currency: "INR",
              reused: true,
              attempt_number: reserveResult.attempt_number,
              reconciled: true,
              environment,
            });
          }
          console.error("[cashfree] Reconcile confirm error:", confirmError);
        }
      }

      // Cashfree doesn't recognize the order, or no session available.
      // The reservation is still in 'reserving' — release it so creator can retry.
      console.log("[cashfree] Order not found at Cashfree, releasing reservation");
      await supabase.rpc("release_cashfree_payment_reservation", {
        p_campaign_id: campaignId,
      });

      return NextResponse.json(
        { error: "Previous order not found. Please retry." },
        { status: 502 },
      );
    } catch (err) {
      console.error("[cashfree] Reconcile fetch failed:", err);
      // Ambiguous: keep reservation, return retryable error
      return NextResponse.json(
        { error: "Unable to verify previous order. Please retry." },
        { status: 502 },
      );
    }
  }

  // ── Step 2: Call Cashfree Create Order with deterministic order_id ───
  const budgetRupees = Number(campaign.budget);
  const budgetPaise = Math.round(budgetRupees * 100);
  const platformFeePaise = Math.round(budgetRupees * 100 * 0.1);
  const totalPayablePaise = budgetPaise + platformFeePaise;
  const totalPayableRupees = totalPayablePaise / 100;

  const createOrderPayload = {
    order_id: orderId,
    order_amount: totalPayableRupees,
    order_currency: "INR",
    customer_details: {
      customer_id: user.id,
      customer_email: user.email || undefined,
      customer_phone: cashfreePhone,
      customer_name: profile.name || "Creator",
    },
    order_meta: {
      return_url: `${appUrl}/creator/campaigns/${campaignId}?payment=success&order_id={order_id}`,
      notify_url: `${appUrl}/api/campaigns/payment/cashfree/webhook`,
    },
    order_note: `Campaign launch payment: ${campaign.title}`,
  };

  try {
    const cashfreeResponse = await fetch(`${CASHFREE_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": CASHFREE_API_VERSION,
        "x-idempotency-key": orderId,
      },
      body: JSON.stringify(createOrderPayload),
    });

    if (!cashfreeResponse.ok) {
      const errorBody = await cashfreeResponse.text();
      console.error("[cashfree] Create order failed:", cashfreeResponse.status, errorBody);

      // Definitive failure: release the reservation
      await supabase.rpc("release_cashfree_payment_reservation", {
        p_campaign_id: campaignId,
      });

      return NextResponse.json(
        { error: "Failed to create payment order" },
        { status: 502 },
      );
    }

    const orderData: CashfreeOrderResponse = await cashfreeResponse.json();

    // ── Step 3: Confirm reservation with Cashfree session details ──────
    const { error: confirmError } = await supabase.rpc(
      "confirm_cashfree_payment_attempt",
      {
        p_campaign_id: campaignId,
        p_cashfree_payment_session_id: orderData.payment_session_id,
      },
    );

    if (confirmError) {
      console.error("[cashfree] Confirm error:", confirmError);
      // Cashfree order was created but DB confirmation failed.
      // Reservation remains in 'reserving' — creator can retry.
      // Same deterministic order_id will be used on retry.
      // Cashfree's x-idempotency-key ensures no duplicate order.
      return NextResponse.json(
        { error: "Payment order created but confirmation failed. Please retry." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      payment_session_id: orderData.payment_session_id,
      order_id: orderData.order_id,
      cf_order_id: orderData.cf_order_id,
      amount: totalPayableRupees,
      currency: "INR",
      attempt_number: reserveResult.attempt_number,
      // Server-authoritative SDK mode for the browser checkout
      environment,
    });
  } catch (err) {
    console.error("[cashfree] Create order exception:", err);

    // Fix #1: Ambiguous network/transport failure.
    // DO NOT release the reservation — the Cashfree order may have been created.
    // Keep reservation in 'reserving' state. On retry, the same deterministic
    // order_id will be used (Cashfree x-idempotency-key matches), so no
    // duplicate order is created. The creator will get a retryable error.
    return NextResponse.json(
      { error: "Payment gateway temporarily unavailable. Please retry." },
      { status: 503 },
    );
  }
}
