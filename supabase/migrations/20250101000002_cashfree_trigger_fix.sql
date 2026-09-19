-- ============================================================================
-- CASHFREE TRIGGER FIX — IDEMPOTENT MIGRATION
-- ============================================================================
-- Fix: enforce_campaign_launch_payment_integrity trigger blocks
-- verify_cashfree_webhook() because is_admin() returns false for service_role
-- (no JWT user → auth.uid() = NULL → no matching admin profile).
--
-- The trigger fires BEFORE UPDATE on campaigns when launch_payment_status
-- changes to 'verified'. It checks is_admin(), which fails for service_role.
--
-- Fix: The trigger now checks for the existence of temporary table
-- _cf_verify_signal, created by verify_cashfree_webhook in the same
-- transaction. This is NOT a client-settable GUC — it is a database object
-- (temp table) that only the SECURITY DEFINER function can create, because
-- ordinary PostgREST connections lack CREATE privilege on pg_temp.
--
-- See campaign-launch-payment-integrity.sql for full security analysis.
--
-- Run AFTER: 20250101000001_cashfree_verified_by_fix.sql
-- Safe to run multiple times (idempotent CREATE OR REPLACE).
-- =============================================================================

-- ── 1. Fix trigger to allow Cashfree webhook verification ──────────────────

CREATE OR REPLACE FUNCTION public.enforce_campaign_launch_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.launch_payment_status IS DISTINCT FROM OLD.launch_payment_status THEN

    -- 'verified' can be set by admin (via verify_campaign_launch_payment RPC)
    -- OR by Cashfree webhook (via verify_cashfree_webhook RPC).
    -- Cashfree path: the SECURITY DEFINER function creates temp table
    -- _cf_verify_signal in the same transaction. We check for its existence.
    IF NEW.launch_payment_status = 'verified' AND NOT public.is_admin() THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = '_cf_verify_signal'
          AND n.nspname LIKE 'pg_temp%'
      ) THEN
        RAISE EXCEPTION 'Only admin can verify campaign launch payment';
      END IF;
    END IF;

    IF NEW.launch_payment_status = 'submitted' THEN
      IF NEW.created_by != auth.uid() AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only the campaign owner can submit launch payment';
      END IF;
    END IF;

    IF NEW.launch_payment_status = 'rejected' AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only admin can reject campaign launch payment';
    END IF;

    IF NEW.launch_payment_status = 'pending' THEN
      RAISE EXCEPTION 'Cannot set launch payment status to pending via UPDATE';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_launch_payment_integrity ON public.campaigns;
CREATE TRIGGER enforce_campaign_launch_payment_integrity
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_campaign_launch_payment_integrity();

-- ── 2. Verification ─────────────────────────────────────────────────────────

SELECT 'enforce_campaign_launch_payment_integrity' AS trigger_fn,
  to_regprocedure('public.enforce_campaign_launch_payment_integrity()') IS NOT NULL AS exists;
