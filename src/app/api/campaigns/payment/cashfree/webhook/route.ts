import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Cashfree webhook signature verification:
// HMAC-SHA256(timestamp + rawBody, secretKey) === x-webhook-signature

const CASHFREE_BASE_URL = "https://sandbox.cashfree.com/pg";
const CASHFREE_API_VERSION = "2025-01-01";

// Webhook timestamp freshness: reject if older than 5 minutes or in the future
const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

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

interface CashfreeOrderAPIResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  payments?: Array<{
    cf_payment_id: string;
    payment_status: string;
    payment_amount: number;
    payment_currency: string;
  }>;
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

  // Constant-time comparison to prevent timing attacks
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

async function fetchCashfreeOrder(
  orderId: string,
): Promise<CashfreeOrderAPIResponse | null> {
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
      console.error("[cashfree-webhook] Cashfree API error:", response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error("[cashfree-webhook] Cashfree API fetch failed:", err);
    return null;
  }
}

export async function POST(request: Request) {
  // Use service-role client for webhook processing (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) {
    console.error("[cashfree-webhook] CASHFREE_SECRET_KEY not configured");
    // Config error — allow retry in case this is transient
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  // ── 1. Capture raw body (before any JSON parsing) ──────────────────────
  const rawBody = await request.text();

  // ── 2. Verify webhook signature ────────────────────────────────────────
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

  // ── 3. Verify timestamp freshness ──────────────────────────────────────
  const freshness = isTimestampFresh(webhookTimestamp);
  if (!freshness.valid) {
    console.error("[cashfree-webhook] Stale or invalid timestamp:", freshness.reason);
    return NextResponse.json({ error: "Stale webhook" }, { status: 410 });
  }

  // ── 4. Parse payload ───────────────────────────────────────────────────
  let payload: CashfreeWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[cashfree-webhook] Invalid JSON payload");
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { type, data } = payload;
  const orderId = data?.order?.order_id;
  const paymentStatus = data?.payment?.payment_status;

  if (!orderId || !paymentStatus) {
    console.error("[cashfree-webhook] Missing order_id or payment_status");
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  console.log(`[cashfree-webhook] Received: type=${type}, order=${orderId}, status=${paymentStatus}`);

  // ── 5. Resolve stored order ────────────────────────────────────────────
  const { data: paymentRecord, error: lookupError } = await supabase
    .from("campaign_launch_payments")
    .select("id, campaign_id, payment_status, total_payable_paise, cashfree_order_id, cashfree_flow")
    .eq("cashfree_order_id", orderId)
    .single();

  if (lookupError || !paymentRecord) {
    console.error(`[cashfree-webhook] No payment record for order ${orderId}`);
    // Unknown order — log and return 200 to prevent infinite retries
    await supabase.from("audit_logs").insert({
      id: crypto.randomUUID(),
      actor_id: "00000000-0000-0000-0000-000000000000",
      actor: "system",
      action: "cashfree_webhook_unknown_order",
      entity_type: "campaign",
      entity_id: "unknown",
      metadata: { cashfree_order_id: orderId, type },
      idempotency_key: `webhook_unknown_${orderId}_${Date.now()}`,
    });
    return NextResponse.json({ received: true });
  }

  // Idempotent: already verified → return 200
  if (paymentRecord.payment_status === "verified") {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // ── 6. Server-side Cashfree order verification ─────────────────────────
  // DO NOT trust webhook payload for amount/status. Call Cashfree API.
  const orderData = await fetchCashfreeOrder(orderId);

  if (!orderData) {
    console.error(`[cashfree-webhook] Failed to fetch order ${orderId} from Cashfree`);
    // Temporary failure — allow Cashfree retry
    return NextResponse.json({ error: "Upstream verification failed" }, { status: 502 });
  }

  // ── 7. Verify authoritative payment state ──────────────────────────────

  // 7a. Verify order status is PAID
  if (orderData.order_status !== "PAID") {
    console.error(`[cashfree-webhook] Order ${orderId} is not PAID: ${orderData.order_status}`);

    if (type === "PAYMENT_FAILED_WEBHOOK" || paymentStatus === "FAILED") {
      // Call reject RPC for failed payments
      const failureReason = data?.payment?.payment_message || "Payment failed via Cashfree";
      await supabase.rpc("reject_cashfree_webhook", {
        p_cashfree_order_id: orderId,
        p_cf_payment_id: data?.payment?.cf_payment_id || "",
        p_failure_reason: failureReason,
      });
    }

    return NextResponse.json({ received: true });
  }

  // 7b. Find the successful payment in the order's payments array
  const successfulPayment = orderData.payments?.find(
    (p) => p.payment_status === "SUCCESS",
  );

  if (!successfulPayment) {
    console.error(`[cashfree-webhook] Order ${orderId} is PAID but no SUCCESS payment found`);
    return NextResponse.json({ received: true });
  }

  // 7c. Verify payment belongs to this order
  if (successfulPayment.cf_payment_id !== data?.payment?.cf_payment_id) {
    console.error(`[cashfree-webhook] Payment ID mismatch: webhook=${data?.payment?.cf_payment_id}, actual=${successfulPayment.cf_payment_id}`);
  }

  // 7d. Verify exact amount (Cashfree sends in rupees, we store in paise)
  const expectedAmountRupees = paymentRecord.total_payable_paise / 100;
  if (Math.abs(successfulPayment.payment_amount - expectedAmountRupees) > 0.01) {
    console.error(`[cashfree-webhook] Amount mismatch: expected=${expectedAmountRupees}, actual=${successfulPayment.payment_amount}`);

    await supabase.rpc("reject_cashfree_webhook", {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: successfulPayment.cf_payment_id,
      p_failure_reason: "Amount mismatch detected",
    });

    return NextResponse.json({ received: true });
  }

  // 7e. Verify currency is INR
  if (successfulPayment.payment_currency !== "INR") {
    console.error(`[cashfree-webhook] Currency mismatch: expected=INR, actual=${successfulPayment.payment_currency}`);

    await supabase.rpc("reject_cashfree_webhook", {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: successfulPayment.cf_payment_id,
      p_failure_reason: "Currency mismatch detected",
    });

    return NextResponse.json({ received: true });
  }

  // ── 8. All checks passed — perform atomic verification ─────────────────
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "verify_cashfree_webhook",
    {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: successfulPayment.cf_payment_id,
      p_payment_amount_rupees: successfulPayment.payment_amount,
    },
  );

  if (rpcError) {
    console.error("[cashfree-webhook] verify_cashfree_webhook error:", rpcError);
    // Temporary DB failure — allow Cashfree retry
    return NextResponse.json({ error: "Verification failed" }, { status: 502 });
  }

  console.log(`[cashfree-webhook] Verified payment for order ${orderId}:`, rpcResult);

  // ── 9. Always return 200 OK for successfully processed webhooks ────────
  return NextResponse.json({ received: true });
}
