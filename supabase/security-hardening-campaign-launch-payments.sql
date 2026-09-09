-- ============================================================================
-- SECURITY HARDENING: CAMPAIGN LAUNCH PAYMENTS
-- ============================================================================
-- Creator/Brand payment submissions must go through the controlled
-- submit_campaign_launch_payment(uuid, text) SECURITY DEFINER RPC.
--
-- This migration removes direct Creator/Brand table writes so they cannot
-- forge payment amounts, fees, statuses, verification metadata, etc.
-- Admin verification/rejection also remains controlled by SECURITY DEFINER RPCs.
--
-- Run AFTER campaign-launch-payments.sql.
-- ============================================================================

ALTER TABLE public.campaign_launch_payments ENABLE ROW LEVEL SECURITY;

-- Remove the vulnerable direct Creator/Brand write policies.
DROP POLICY IF EXISTS campaign_launch_payments_insert_creator
  ON public.campaign_launch_payments;

DROP POLICY IF EXISTS campaign_launch_payments_update_creator
  ON public.campaign_launch_payments;

-- Remove direct table writes from the normal authenticated role entirely.
-- The SECURITY DEFINER RPCs execute with their owner's privileges and therefore
-- can still perform the required INSERT/UPDATE after validating auth.uid().
REVOKE INSERT, UPDATE, DELETE
  ON public.campaign_launch_payments
  FROM authenticated;

-- Keep Creator/Brand read access limited to their own payment records.
DROP POLICY IF EXISTS campaign_launch_payments_select_creator
  ON public.campaign_launch_payments;

CREATE POLICY campaign_launch_payments_select_creator
  ON public.campaign_launch_payments
  FOR SELECT
  USING (auth.uid() = creator_id);

-- Keep Admin read access.
DROP POLICY IF EXISTS campaign_launch_payments_select_admin
  ON public.campaign_launch_payments;

CREATE POLICY campaign_launch_payments_select_admin
  ON public.campaign_launch_payments
  FOR SELECT
  USING (public.is_admin());

-- No direct Creator/Brand INSERT/UPDATE/DELETE policy is intentionally defined.
-- Creator/Brand flow:
--   submit_campaign_launch_payment(campaign_id, utr)
-- Admin flow:
--   verify_campaign_launch_payment(payment_id)
--   reject_campaign_launch_payment(payment_id, reason)

COMMENT ON TABLE public.campaign_launch_payments IS
  'Financial launch-payment records. Creator/Brand writes are only through controlled RPCs; Admin verifies/rejects through controlled RPCs.';
