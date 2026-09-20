-- ============================================================================
-- MIGRATION 000005: Cashfree webhook retry safety + OAuth verification fix
-- ============================================================================
-- Run AFTER: 000004_revoke_temp_table_privilege.sql
--
-- Changes:
--   1. Cashfree: Do NOT permanently reject on retryable payment failures.
--      PAYMENT_FAILED_WEBHOOK events leave the record in 'submitted' state
--      so the creator can retry. Only amount/currency mismatches are terminal.
--   2. Cashfree: reject_cashfree_webhook() now only processes terminal failures.
--      Retryable failures are logged but not permanently rejected.
--
-- NOTE: The OAuth verification fix is in TypeScript (callback route),
--       not in SQL. No SQL change needed for that.
-- ============================================================================

-- Update reject_cashfree_webhook documentation (no logic change needed —
-- the webhook handler already stopped calling it for retryable failures).
-- This migration ensures the function comment is authoritative.

COMMENT ON FUNCTION public.reject_cashfree_webhook(text, text, text) IS
  'TERMINAL failure only. Do NOT call for retryable payment failures. '
  'Use for: amount mismatch, currency mismatch, definitive gateway rejection. '
  'Payment-level failures should leave record in submitted state for retry.';

COMMENT ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) IS
  'Atomic Cashfree webhook verification. Idempotent. Uses FOR UPDATE locking. '
  'On amount mismatch: rejects (terminal). On success: verifies payment and opens campaign. '
  'Creates _cf_verify_signal and _campaign_transition_signal temp tables for trigger authorization.';

-- Verify the webhook handler no longer rejects on payment failure
-- (this is enforced by the TypeScript code change, not SQL)
