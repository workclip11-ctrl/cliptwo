// ---------------------------------------------------------------------------
// Token encryption — AES-256-GCM for OAuth tokens.
// Tokens are encrypted before storage in social_connections and decrypted
// only by backend service_role jobs. The browser never sees plaintext tokens.
//
// Env: SOCIAL_TOKEN_KEY — 32-byte hex key (64 hex chars).
//      If unset, a dev-only fallback is used (MUST NOT deploy with fallback).
// ---------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_KEY;
  if (raw && raw.length >= 64) {
    return Buffer.from(raw.slice(0, 64), "hex");
  }
  // Dev-only fallback — 32 random bytes. NOT for production.
  console.warn(
    "[token-crypto] SOCIAL_TOKEN_KEY not set — using ephemeral dev key. " +
      "Tokens will NOT survive server restarts. Set SOCIAL_TOKEN_KEY for production.",
  );
  return randomBytes(32);
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Format: iv(12) + tag(16) + ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export function tokenExpiresIn(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
