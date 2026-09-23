"use client";

// ---------------------------------------------------------------------------
// OAuth onboarding intent
//
// Carries the intended role (clipper/creator) for a NEW user through the
// Google OAuth round trip WITHOUT relying on user_metadata.
//
// Background: signInWithOAuth `queryParams` are forwarded to Google's
// authorize endpoint and discarded there — Supabase never writes them to
// user_metadata. The intent therefore travels in OUR OWN redirectTo URL
// (`/auth/callback?intent=…&nonce=…`, preserved by Supabase and forwarded by
// the callback route to /auth/complete), mirrored per-tab in sessionStorage
// as a fallback (e.g. new-tab edge cases).
//
// Security contract:
//   - Strict allowlist: only "clipper" | "creator". Anything else → no intent.
//   - The intent is ONLY an onboarding hint for users WITHOUT a profile.
//     /auth/complete checks profiles.role first; an existing profile ALWAYS
//     wins and any stored intent is discarded.
//   - finalize_profile() remains authoritative (auth.uid-derived, admin
//     rejected, existing preserved, SECURITY DEFINER, authenticated-only).
//   - sessionStorage is per-tab, so concurrent OAuth attempts in different
//     tabs cannot leak intents into each other.
//   - Stale protection: overwritten on every new OAuth start, TTL-bound,
//     consumed (cleared) on finalize / explicit role choice / existing-user
//     routing, and cleared for generic logins.
// ---------------------------------------------------------------------------

export type OAuthIntentRole = "clipper" | "creator";

export interface OAuthIntent {
  role: OAuthIntentRole;
  nonce: string;
  ts: number;
}

const STORAGE_KEY = "cliptwo_oauth_intent_v1";

/** Intent expires 30 minutes after the OAuth attempt starts. */
export const OAUTH_INTENT_TTL_MS = 30 * 60 * 1000;

export function isOAuthIntentRole(v: unknown): v is OAuthIntentRole {
  return v === "clipper" || v === "creator";
}

export function newOAuthNonce(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to Math.random fallback */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Persist this tab's OAuth intent (overwrites any previous attempt). */
export function writeOAuthIntent(role: OAuthIntentRole, nonce: string): void {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ role, nonce, ts: Date.now() } satisfies OAuthIntent),
    );
  } catch {
    /* storage unavailable — URL intent remains the primary carrier */
  }
}

/** Consume-and-clear: call after finalize / explicit choice / existing route. */
export function clearOAuthIntent(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Read this tab's stored intent; returns null when absent/invalid/expired. */
export function readOAuthIntent(
  maxAgeMs: number = OAUTH_INTENT_TTL_MS,
): OAuthIntent | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OAuthIntent>;
    if (!isOAuthIntentRole(parsed.role)) {
      clearOAuthIntent();
      return null;
    }
    if (
      typeof parsed.nonce !== "string" ||
      parsed.nonce.length === 0 ||
      typeof parsed.ts !== "number" ||
      Date.now() - parsed.ts > maxAgeMs
    ) {
      clearOAuthIntent();
      return null;
    }
    return { role: parsed.role, nonce: parsed.nonce, ts: parsed.ts };
  } catch {
    return null;
  }
}
