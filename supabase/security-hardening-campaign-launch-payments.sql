-- ============================================================================
-- SECURITY HARDENING: CAMPAIGN LAUNCH PAYMENTS (verification)
-- ============================================================================
-- As of Phase 6 correction, campaign-launch-payments.sql is self-contained:
-- it creates only SELECT policies and REVOKEs INSERT/UPDATE/DELETE on the
-- authenticated role. All writes go through SECURITY DEFINER RPCs only.
--
-- This file serves as a safety net: it verifies the hardening state and
-- adds the table comment if the source file was run independently.
--
-- Run AFTER campaign-launch-payments.sql.
-- ============================================================================

ALTER TABLE public.campaign_launch_payments ENABLE ROW LEVEL SECURITY;

-- Drop any direct write policies that might exist from an older version.
-- Safe to call even if they don't exist (IF EXISTS).
DROP POLICY IF EXISTS campaign_launch_payments_insert_creator
  ON public.campaign_launch_payments;

DROP POLICY IF EXISTS campaign_launch_payments_update_creator
  ON public.campaign_launch_payments;

-- Ensure INSERT/UPDATE/DELETE is revoked from authenticated role.
-- Idempotent: REVOKE is safe to re-apply.
REVOKE INSERT, UPDATE, DELETE
  ON public.campaign_launch_payments
  FROM authenticated;

COMMENT ON TABLE public.campaign_launch_payments IS
  'Financial launch-payment records. Creator writes via submit_campaign_launch_payment(); Admin verifies/rejects via verify/reject RPCs. No direct authenticated writes.';
