// ---------------------------------------------------------------------------
// Payment Provider Abstraction
//
// All payment operations happen server-side only. The browser NEVER sees
// API credentials. Providers are pluggable — swap mock for real in prod.
//
// MOCK PROVIDER: For development only. Simulates a 2-second processing delay
// then returns success. Does NOT send real money. In production, the mock
// provider throws an error if PAYMENT_PROVIDER is not set to a real provider.
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

// ---------------------------------------------------------------------------
// Mock Provider — development only, no real money moved
// ---------------------------------------------------------------------------
class MockPaymentProvider implements PaymentProvider {
  name = "mock";

  async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 2000));

    // Simulate occasional failures (10% chance for testing)
    const shouldFail = Math.random() < 0.1;

    if (shouldFail) {
      return {
        success: false,
        error: "Mock provider: simulated failure for testing",
        status: "failed",
      };
    }

    return {
      success: true,
      providerRef: `MOCK-${request.payoutId.slice(0, 8).toUpperCase()}-${Date.now()}`,
      status: "completed",
    };
  }

  verifyWebhook(_payload: WebhookPayload): boolean {
    // Mock provider always accepts webhooks
    return true;
  }
}

// ---------------------------------------------------------------------------
// Razorpay Provider — production UPI payouts (placeholder)
// Real implementation would use Razorpay Payouts API.
// Credentials are read server-side only, NEVER exposed to browser.
// ---------------------------------------------------------------------------
// class RazorpayPaymentProvider implements PaymentProvider {
//   name = "razorpay";
//   private keyId: string;
//   private keySecret: string;
//
//   constructor() {
//     this.keyId = process.env.RAZORPAY_KEY_ID ?? "";
//     this.keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
//     if (!this.keyId || !this.keySecret) {
//       throw new Error("Razorpay credentials not configured");
//     }
//   }
//
//   async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
//     // Real Razorpay Payouts API call here
//     // Uses server-side only credentials
//   }
//
//   verifyWebhook(payload: WebhookPayload): boolean {
//     // Verify Razorpay webhook signature using keySecret
//   }
// }

// ---------------------------------------------------------------------------
// Provider Factory — returns the configured provider
// NEVER exposes credentials to the client.
// ---------------------------------------------------------------------------
export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return new MockPaymentProvider();
    // case "razorpay":
    //   return new RazorpayPaymentProvider();
    default:
      console.warn(
        `Unknown payment provider "${providerName}", falling back to mock`,
      );
      return new MockPaymentProvider();
  }
}
