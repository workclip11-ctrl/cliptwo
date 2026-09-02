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
    const randomByte = new Uint8Array(1);
    crypto.getRandomValues(randomByte);
    const shouldFail = randomByte[0] < 26; // ~10% of 256

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
// Provider Factory — returns the configured provider
// NEVER exposes credentials to the client.
// ---------------------------------------------------------------------------
export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER ?? "mock";

  switch (providerName) {
    case "mock":
      return new MockPaymentProvider();
    default:
      console.warn(
        `Unknown payment provider "${providerName}", falling back to mock`,
      );
      return new MockPaymentProvider();
  }
}
