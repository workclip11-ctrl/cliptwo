// ---------------------------------------------------------------------------
// Cashfree environment configuration (server-side only).
//
// The API base URL is environment-driven — NEVER hardcoded to sandbox:
//   production → https://api.cashfree.com/pg
//   sandbox    → https://sandbox.cashfree.com/pg
//
// Fail-closed rules (no silent sandbox fallback in production):
//   - CASHFREE_ENVIRONMENT must be explicitly "production" or "sandbox"
//     (case-insensitive, trimmed). Any other value — including unset —
//     is invalid and resolves to null; callers must refuse to operate.
//   - In production builds (NODE_ENV === "production") only "production"
//     is valid; an explicit "sandbox" is rejected there too.
//   - CASHFREE_APP_ID and CASHFREE_SECRET_KEY must both be present.
//
// SECURITY: this module never logs credential values. Callers must not log
// appId/secretKey either.
// ---------------------------------------------------------------------------

export type CashfreeEnvironment = "production" | "sandbox";

export interface CashfreeConfig {
  environment: CashfreeEnvironment;
  baseUrl: string;
  appId: string;
  secretKey: string;
}

export const CASHFREE_API_VERSION = "2025-01-01";

const CASHFREE_BASE_URLS: Record<CashfreeEnvironment, string> = {
  production: "https://api.cashfree.com/pg",
  sandbox: "https://sandbox.cashfree.com/pg",
};

/**
 * Resolve and validate CASHFREE_ENVIRONMENT.
 * Returns null when the value is missing/unknown, or when sandbox is
 * requested in a production build (fail closed).
 */
export function resolveCashfreeEnvironment(
  raw: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CashfreeEnvironment | null {
  const value = raw?.trim().toLowerCase();
  if (value !== "production" && value !== "sandbox") return null;
  // Production builds may only run against the production gateway.
  if (nodeEnv === "production" && value !== "production") return null;
  return value;
}

/**
 * Full configuration for server routes (create-order + webhook).
 * Returns null when ANY part is missing/invalid — callers must then fail
 * closed (503 for order creation, 500 for the webhook) instead of guessing.
 */
export function getCashfreeConfig(
  env: NodeJS.ProcessEnv = process.env,
): CashfreeConfig | null {
  const environment = resolveCashfreeEnvironment(
    env.CASHFREE_ENVIRONMENT,
    env.NODE_ENV,
  );
  if (!environment) return null;

  const appId = env.CASHFREE_APP_ID;
  const secretKey = env.CASHFREE_SECRET_KEY;
  if (!appId || !secretKey) return null;

  return {
    environment,
    baseUrl: CASHFREE_BASE_URLS[environment],
    appId,
    secretKey,
  };
}
