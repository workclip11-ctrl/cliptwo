import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeError } from "@/lib/api-helpers";

const CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
const CASHFREE_API_VERSION = "2025-01-01";

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

  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appId || !secretKey) {
    console.error("[cashfree] CASHFREE_APP_ID or CASHFREE_SECRET_KEY not configured");
    return NextResponse.json(
      { error: "Payment gateway not configured" },
      { status: 503 },
    );
  }

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

  // ── Creator auth via token (RLS-enforced) ────────────────────────────
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  // Verify caller is an active creator and owns the campaign
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

  // Fetch campaign — must belong to creator, must be draft only
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

  // ── Phone lookup via service-role (server-only) ──────────────────────
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

  // ── Step 1: Atomically reserve payment attempt (DB-authoritative) ────
  // This is the serialization point. Concurrent requests for the same
  // campaign will serialize here. Only one can successfully reserve.
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

  // If reused, return the existing session (don't call Cashfree again)
  if (reserveResult.reused) {
    return NextResponse.json({
      success: true,
      payment_session_id: paymentSessionId,
      order_id: orderId,
      amount: Number(campaign.budget) * 1.1,
      currency: "INR",
      reused: true,
      attempt_number: reserveResult.attempt_number,
    });
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
      customer_phone: phone,
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

      // Release the reservation so the creator can retry
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
      // The reservation is still in 'reserving' state — creator can retry.
      // The Cashfree order_id is deterministic, so retry will reuse it.
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
    });
  } catch (err) {
    console.error("[cashfree] Create order exception:", err);

    // Release the reservation so the creator can retry
    await supabase.rpc("release_cashfree_payment_reservation", {
      p_campaign_id: campaignId,
    });

    return NextResponse.json(
      { error: "Payment gateway error" },
      { status: 500 },
    );
  }
}
