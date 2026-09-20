// ---------------------------------------------------------------------------
// Payment Provider Abstraction
//
// Cliptwo payment flows:
//
//   CAMPAIGN LAUNCH PAYMENT (Creator → Platform):
//     Cashfree Web Checkout (sandbox). Creator pays to launch a campaign.
//     Webhook at /api/campaigns/payment/cashfree/webhook verifies signature,
//     amount, currency, then calls verify_cashfree_webhook() RPC which
//     atomically transitions payment_status → 'verified' and
//     campaign.status → 'open'.
//
//   CLIPPER PAYOUT (Platform → Clipper):
//     Manual UPI payments performed by the Admin.
//     1. Clipper requests payout → payout_requests record (status: pending)
//     2. Admin reviews payout request
//     3. Admin manually sends UPI payment to clipper's UPI ID
//     4. Admin records UPI transaction reference (UTR/NEFT ref)
//     5. Admin marks payout as paid → payout_requests.status = 'paid'
//
// This file documents the payout interfaces for reference.
// No automated payout gateway is used.
// ---------------------------------------------------------------------------

export interface PayoutRequest {
  payoutId: string;
  amount: number; // in paise
  currency: string;
  upiId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface PayoutResponse {
  success: boolean;
  providerRef?: string;
  error?: string;
  status: "pending" | "completed" | "failed";
}

export interface WebhookPayload {
  event: "payout.completed" | "payout.failed";
  providerRef: string;
  payoutId: string;
  amount: number;
  timestamp: string;
  signature?: string;
}

export interface PaymentProvider {
  name: string;
  initiatePayout(request: PayoutRequest): Promise<PayoutResponse>;
  verifyWebhook(payload: WebhookPayload): boolean;
}
