import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Cashfree webhook signature verification:
// HMAC-SHA256(timestamp + rawBody, secretKey) === x-webhook-signature

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

export async function POST(request: Request) {
  // Use service-role client for webhook processing (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const secretKey = process.env.CASHFREE_SECRET_KEY;
  if (!secretKey) {
    console.error("[cashfree-webhook] CASHFREE_SECRET_KEY not configured");
    // Must return 200 to prevent Cashfree retries for our config errors
    return NextResponse.json({ received: true });
  }

  // ── 1. Capture raw body (before any JSON parsing) ──────────────────────
  const rawBody = await request.text();

  // ── 2. Verify webhook signature ────────────────────────────────────────
  const webhookSignature = request.headers.get("x-webhook-signature");
  const webhookTimestamp = request.headers.get("x-webhook-timestamp");

  if (!webhookSignature || !webhookTimestamp) {
    console.error("[cashfree-webhook] Missing webhook signature or timestamp headers");
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  const isValid = verifyWebhookSignature(webhookTimestamp, rawBody, webhookSignature, secretKey);
  if (!isValid) {
    console.error("[cashfree-webhook] Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 3. Parse payload ───────────────────────────────────────────────────
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
  const cfPaymentId = data?.payment?.cf_payment_id;
  const paymentAmount = data?.payment?.payment_amount;

  if (!orderId || !paymentStatus) {
    console.error("[cashfree-webhook] Missing order_id or payment_status");
    return NextResponse.json({ received: true });
  }

  console.log(`[cashfree-webhook] Received: type=${type}, order=${orderId}, status=${paymentStatus}`);

  // ── 4. Handle payment success ──────────────────────────────────────────
  if (type === "PAYMENT_SUCCESS_WEBHOOK" && paymentStatus === "SUCCESS") {
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "verify_cashfree_webhook",
      {
        p_cashfree_order_id: orderId,
        p_cf_payment_id: cfPaymentId || "",
        p_payment_amount_rupees: paymentAmount || 0,
      },
    );

    if (rpcError) {
      console.error("[cashfree-webhook] verify_cashfree_webhook error:", rpcError);
      // Return 200 — don't let Cashfree retry for our DB errors
      // The admin can manually verify via the existing UTR flow
      return NextResponse.json({ received: true });
    }

    console.log(`[cashfree-webhook] Verified payment for order ${orderId}:`, rpcResult);
  }

  // ── 5. Handle payment failure ──────────────────────────────────────────
  if (type === "PAYMENT_FAILED_WEBHOOK" || paymentStatus === "FAILED") {
    const failureReason = data?.payment?.payment_message || "Payment failed via Cashfree";

    const { error: rejectError } = await supabase.rpc("reject_cashfree_webhook", {
      p_cashfree_order_id: orderId,
      p_cf_payment_id: cfPaymentId || "",
      p_failure_reason: failureReason,
    });

    if (rejectError) {
      console.error("[cashfree-webhook] reject_cashfree_webhook error:", rejectError);
    } else {
      console.log(`[cashfree-webhook] Rejected payment for order ${orderId}: ${failureReason}`);
    }
  }

  // ── 6. Handle user dropped ─────────────────────────────────────────────
  if (type === "PAYMENT_USER_DROPPED_WEBHOOK") {
    console.log(`[cashfree-webhook] User dropped payment for order ${orderId}`);
    // Don't reject — user might retry. Just log for now.
  }

  // ── 7. Always return 200 OK ────────────────────────────────────────────
  // Cashfree retries on non-2xx. We don't want retries for logic errors.
  return NextResponse.json({ received: true });
}
