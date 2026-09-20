import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
const CASHFREE_API_VERSION = "2025-01-01";

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

interface CashfreeWebhookPayload {
  data: {
    order: {
      order_id: string;
      order_amount: number;
      order_currency: string;
    };
    payment: {
      cf_payment_id: string;
      payment_status: string;
      payment_amount: number;
      payment_currency: string;
      payment_message?: string;
    };
  };
  event_time: string;
  type: string;
}

interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
}

interface CashfreePaymentAttempt {
  cf_payment_id: string;
  order_id: string;
  payment_status: string;
  payment_amount: number;
  payment_currency: string;
}

function verifyWebhookSignature(
  timestamp: string,
  rawBody: string,
  signature: string,
  secretKey: string,
): boolean {
  const signedPayload = timestamp + rawBody;
  const computedSignature = crypto
    .createHmac("sha256", secretKey)
    .update(signedPayload)
    .digest("base64");

  if (computedSignature.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(computedSignature),
    Buffer.from(signature),
  );
}

function isTimestampFresh(timestamp: string): { valid: boolean; reason?: string } {
  const tsMs = Number(timestamp);
  if (Number.isNaN(tsMs)) {
    return { valid: false, reason: "Timestamp is not a valid number" };
  }
  const now = Date.now();
  const age = now - tsMs;
  if (age > WEBHOOK_MAX_AGE_MS) {
    return { valid: false, reason: `Timestamp is ${Math.round(age / 1000)}s old (max ${WEBHOOK_MAX_AGE_MS / 1000}s)` };
  }
  if (age < -WEBHOOK_MAX_AGE_MS) {
    return { valid: false, reason: "Timestamp is in the future" };
  }
  return { valid: true };
}

async function fetchCashfreeOrder(orderId: string): Promise<CashfreeOrderResponse | null> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) {
    console.error("[cashfree-webhook] CASHFREE_APP_ID or CASHFREE_SECRET_KEY not configured");
    return null;
  }
  try {
    const response = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": CASHFREE_API_VERSION,
      },
    });
    if (!response.ok) {
      console.error("[cashfree-webhook] Cashfree order API error:", response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error("[cashfree-webhook] Cashfree order API fetch failed:", err);
    return null;
  }
}

async function fetchCashfreePayments(orderId: string): Promise<CashfreePaymentAttempt[]> {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) {
    return [];
  }
  try {
    const response = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}/payments`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": CASHFREE_API_VERSION,
      },
    });
    if (!response.ok) {
      console.error("[cashfree-webhook] Cashfree payments API error:", response.status);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[cashfree-webhook] Cashfree payments API fetch failed:", err);
    return [];
  }
}

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) {
    console.error("[cashfree-webhook] CASHFREE_SECRET_KEY not configured");
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  const rawBody = await request.text();

  const webhookSignature = request.headers.get("x-webhook-signature");
  const webhookTimestamp = request.headers.get("x-webhook-timestamp");

  if (!webhookSignature || !webhookTimestamp) {
    console.error("[cashfree-webhook] Missing webhook signature or timestamp headers");
    return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
  }

  const isValid = verifyWebhookSignature(webhookTimestamp, rawBody, webhookSignature, secretKey);
  if (!isValid) {
    console.error("[cashfree-webhook] Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const freshness = isTimestampFresh(webhookTimestamp);
  if (!freshness.valid) {
    console.error("[cashfree-webhook] Stale or invalid timestamp:", freshness.reason);
    return NextResponse.json({ error: "Stale webhook" }, { status: 410 });
  }

  let payload: CashfreeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[cashfree-webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { type, data } = payload;
  const orderId = data?.order?.order_id;
  const webhookPaymentStatus = data?.payment?.payment_status;
  const webhookCfPaymentId = data?.payment?.cf_payment_id;

  if (!orderId || !webhookPaymentStatus) {
    console.error("[cashfree-webhook] Missing order_id or payment_status");
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  console.log(`[cashfree-webhook] Received: type=${type}, order=${orderId}, status=${webhookPaymentStatus}`);

  // ── Resolve stored order ──────────────────────────────────────────────
  const { data: paymentRecord, error: lookupError } = await supabase
    .from("campaign_launch_payments")
    .select("id, campaign_id, payment_status, total_payable_paise, cashfree_order_id, cashfree_flow")
    .eq("cashfree_order_id", orderId)
    .single();

  if (lookupError || !paymentRecord) {
    console.error(`[cashfree-webhook] No payment record for order ${orderId}`);
    await supabase.from("audit_logs").insert({
      id: crypto.randomUUID(),
      actor_id: null,
      actor: "system",
      action: "cashfree_webhook_unknown_order",
      entity_type: "campaign",
      entity_id: "unknown",
      metadata: { cashfree_order_id: orderId, type },
      idempotency_key: `webhook_unknown_${orderId}_${Date.now()}`,
    });
    return NextResponse.json({ received: true });
  }

  if (paymentRecord.payment_status === "verified") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // ── Fetch order details from Cashfree ──────────────────────────────────
  const orderData = await fetchCashfreeOrder(orderId);
  if (!orderData) {
    console.error(`[cashfree-webhook] Failed to fetch order ${orderId} from Cashfree`);
    return NextResponse.json({ error: "Upstream verification failed" }, { status: 502 });
  }

  // Verify order-level status is PAID
  if (orderData.order_status !== "PAID") {
    console.error(`[cashfree-webhook] Order ${orderId} is not PAID: ${orderData.order_status}`);

    if (type === "PAYMENT_FAILED_WEBHOOK" || webhookPaymentStatus === "FAILED") {
      await supabase.rpc("reject_cashfree_webhook", {
        p_cashfree_order_id: orderId,
        p_cf_payment_id: webhookCfPaymentId || "",
        p_failure_reason: data?.payment?.payment_message || "Payment failed via Cashfree",
      });
    }

    return NextResponse.json({ received: true });
  }

  // ── Fetch payment attempts from Cashfree /orders/{id}/payments ────────
  const payments = await fetchCashfreePayments(orderId);
  if (!payments.length) {
    console.error(`[cashfree-webhook] Order ${orderId} is PAID but no payment attempts returned`);
    return NextResponse.json({ error: "No payment attempts found" }, { status: 502 });
  }

  // ── Fix #3: Find EXACT payment by cf_payment_id ──────────────────────
  // Do NOT just find first SUCCESS — match the specific payment the webhook
  // references. If no exact match, do NOT reject the campaign — log and
  // return retry-safe response.
  const exactPayment = payments.find(
    (p) => p.cf_payment_id === webhookCfPaymentId,
  );

  if (!exactPayment) {
    // Webhook references a payment that doesn't exist in authoritative data.
    // This could be a stale/delayed webhook for a failed attempt.
    // Do NOT reject the campaign. Log and return 200 (retry-safe).
    console.error(
      `[cashfree-webhook] Webhook cf_payment_id ${webhookCfPaymentId} not found in authoritative payments for order ${orderId}`,
    );
    await supabase.from("audit_logs").insert({
      id: crypto.randomUUID(),
      actor_id: null,
      actor: "system",
      action: "cashfree_webhook_payment_id_not_found",
      entity_type: "campaign",
      entity_id: paymentRecord.campaign_id,
      metadata: {
        cashfree_order_id: orderId,
        webhook_cf_payment_id: webhookCfPaymentId,
        authoritative_payment_ids: payments.map((p) => p.cf_payment_id),
      },
      idempotency_key: `webhook_unknown_payment_${orderId}_${webhookCfPaymentId}`,
    });
    return NextResponse.json({ received: true });
  }

  // ── Exact payment found — verify it is SUCCESS ────────────────────────
  if (exactPayment.payment_status !== "SUCCESS") {
    console.error(
      `[cashfree-webhook] Exact payment ${webhookCfPaymentId} is not SUCCESS: ${exactPayment.payment_status}`,
    );
    // Do NOT reject the campaign — this is just a non-successful attempt.
    // Return 200 so Cashfree doesn't retry.
    return NextResponse.json({ received: true });
  }

  // ── Verify exact amount ──────────────────────────────────────────────
  const expectedAmountRupees = paymentRecord.total_payable_paise / 100;
  if (Math.abs(exactPayment.payment_amount - expectedAmountRupees) > 0.01) {
    console.error(
      `[cashfree-webhook] Amount mismatch: expected=${expectedAmountRupees}, actual=${exactPayment.payment_amount}`,
    );
    await supabase.rpc("reject_cashfree_webhook", {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: exactPayment.cf_payment_id,
      p_failure_reason: `Amount mismatch: expected ${expectedAmountRupees}, got ${exactPayment.payment_amount}`,
    });
    return NextResponse.json({ received: true });
  }

  // ── Verify currency is INR ────────────────────────────────────────────
  if (exactPayment.payment_currency !== "INR") {
    console.error(
      `[cashfree-webhook] Currency mismatch: expected=INR, actual=${exactPayment.payment_currency}`,
    );
    await supabase.rpc("reject_cashfree_webhook", {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: exactPayment.cf_payment_id,
      p_failure_reason: `Currency mismatch: expected INR, got ${exactPayment.payment_currency}`,
    });
    return NextResponse.json({ received: true });
  }

  // ── All checks passed — atomic verification ──────────────────────────
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "verify_cashfree_webhook",
    {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: exactPayment.cf_payment_id,
      p_payment_amount_rupees: exactPayment.payment_amount,
    },
  );

  if (rpcError) {
    console.error("[cashfree-webhook] verify_cashfree_webhook error:", rpcError);
    return NextResponse.json({ error: "Verification failed" }, { status: 502 });
  }

  console.log(`[cashfree-webhook] Verified payment for order ${orderId}:`, rpcResult);

  return NextResponse.json({ received: true });
}
