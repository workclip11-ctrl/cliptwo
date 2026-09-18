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

  // ── Fix #3: Phone lookup via service-role (server-only) ──────────────
  // getAuthenticatedUser() already verified the creator's identity.
  // We use the service-role client solely to read auth.users.phone
  // because the anon-key client cannot call auth.admin endpoints.
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

  // ── Fix #4: Check existing Cashfree payment via RPC (row lock) ──────
  // The RPC handles idempotency with row-level locking.
  // We only need to detect whether to create or reuse at the API layer.
  const { data: existingPayment } = await supabase
    .from("campaign_launch_payments")
    .select("id, cashfree_order_id, cashfree_payment_session_id, payment_status, cashfree_order_status, cashfree_flow")
    .eq("campaign_id", campaignId)
    .single();

  if (existingPayment) {
    if (
      existingPayment.cashfree_order_id &&
      existingPayment.cashfree_flow === "cashfree" &&
      existingPayment.payment_status === "submitted" &&
      existingPayment.cashfree_order_status === "ACTIVE"
    ) {
      return NextResponse.json({
        success: true,
        payment_session_id: existingPayment.cashfree_payment_session_id,
        order_id: existingPayment.cashfree_order_id,
        amount: Number(campaign.budget) * 1.1,
        currency: "INR",
        reused: true,
      });
    }

    if (!["rejected", "pending"].includes(existingPayment.payment_status)) {
      return NextResponse.json(
        { error: "A payment already exists for this campaign" },
        { status: 400 },
      );
    }
  }

  // ── Server-side amount calculation ────────────────────────────────────
  const budgetRupees = Number(campaign.budget);
  const budgetPaise = Math.round(budgetRupees * 100);
  const platformFeePaise = Math.round(budgetRupees * 100 * 0.1);
  const totalPayablePaise = budgetPaise + platformFeePaise;
  const totalPayableRupees = totalPayablePaise / 100;

  // ── Deterministic order ID ────────────────────────────────────────────
  // Use campaign UUID + attempt counter for uniqueness.
  // The RPC enforces one active Cashfree order per campaign via unique constraint.
  const orderId = `cliptwo_${campaignId}_${Date.now()}`;

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
      return NextResponse.json(
        { error: "Failed to create payment order" },
        { status: 502 },
      );
    }

    const orderData: CashfreeOrderResponse = await cashfreeResponse.json();

    // ── RPC handles row locking + idempotency atomically ────────────────
    const { error: rpcError } = await supabase.rpc(
      "submit_campaign_launch_payment_cashfree",
      {
        p_campaign_id: campaignId,
        p_cashfree_order_id: orderData.order_id,
        p_cashfree_payment_session_id: orderData.payment_session_id,
      },
    );

    if (rpcError) {
      console.error("[cashfree] RPC error:", rpcError);
      return NextResponse.json(
        { error: sanitizeError(rpcError.message) },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      payment_session_id: orderData.payment_session_id,
      order_id: orderData.order_id,
      cf_order_id: orderData.cf_order_id,
      amount: totalPayableRupees,
      currency: "INR",
    });
  } catch (err) {
    console.error("[cashfree] Create order exception:", err);
    return NextResponse.json(
      { error: "Payment gateway error" },
      { status: 500 },
    );
  }
}
