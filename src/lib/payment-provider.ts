// ---------------------------------------------------------------------------
// Payment Provider Abstraction
//
// Cliptwo uses MANUAL UPI payments performed by the Admin.
// This file documents the payment interfaces for reference.
//
// The actual payout flow is:
//   1. Clipper requests payout → payout_requests record created (status: pending)
//   2. Admin reviews payout request
//   3. Admin manually sends UPI payment to clipper's UPI ID
//   4. Admin records UPI transaction reference (UTR/NEFT ref)
//   5. Admin marks payout as paid → payout_requests.status = 'paid'
//
// No automated payment gateway is used.
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
