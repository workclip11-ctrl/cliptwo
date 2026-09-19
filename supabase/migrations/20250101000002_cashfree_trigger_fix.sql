-- ============================================================================
-- CASHFREE TRIGGER FIX — IDEMPOTENT MIGRATION
-- ============================================================================
-- Fix: enforce_campaign_launch_payment_integrity trigger blocks
-- verify_cashfree_webhook() because:
--   1. verify_cashfree_webhook is SECURITY DEFINER called by service_role
--   2. service_role has no JWT user, so auth.uid() returns NULL
--   3. is_admin() checks profiles WHERE id = auth.uid() — returns false
--   4. Trigger blocks the UPDATE with 'Only admin can verify campaign launch payment'
--
-- Fix: Allow the trigger to pass when verify_cashfree_webhook sets the
-- session variable app.cashfree_webhook_verified = 'true'.
--
-- Also updates verify_cashfree_webhook to set this session variable before
-- the campaigns UPDATE.
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
    -- OR by Cashfree webhook verification (service_role sets session variable)
    IF NEW.launch_payment_status = 'verified' AND NOT public.is_admin() THEN
      IF current_setting('app.cashfree_webhook_verified', true) IS DISTINCT FROM 'true' THEN
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

-- ── 2. Fix verify_cashfree_webhook to set session variable ──────────────────

CREATE OR REPLACE FUNCTION public.verify_cashfree_webhook(
  p_cashfree_order_id text,
  p_cf_payment_id text,
  p_payment_amount_rupees numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_expected_amount_rupees numeric;
BEGIN
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE cashfree_order_id = p_cashfree_order_id
  FOR UPDATE;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order';
  END IF;

  IF v_payment.payment_status = 'verified' THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'payment_status', 'verified',
      'campaign_id', v_payment.campaign_id,
      'idempotent', true
    );
  END IF;

  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'Payment is not in submitted status';
  END IF;

  v_expected_amount_rupees := v_payment.total_payable_paise / 100.0;

  IF ABS(p_payment_amount_rupees - v_expected_amount_rupees) > 0.01 THEN
    UPDATE public.campaign_launch_payments
    SET
      payment_status = 'rejected',
      rejection_reason = 'Amount mismatch detected',
      cashfree_cf_payment_id = p_cf_payment_id,
      cashfree_order_status = 'FAILED',
      rejected_at = now(),
      updated_at = now()
    WHERE id = v_payment.id;

    UPDATE public.campaigns
    SET launch_payment_status = 'rejected'
    WHERE id = v_payment.campaign_id;

    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      before_state, after_state, metadata, reason, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, NULL, 'system',
      'campaign_payment_rejected_amount_mismatch', 'campaign', v_payment.campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = v_payment.campaign_id),
      jsonb_build_object('payment_status', v_payment.payment_status),
      jsonb_build_object('payment_status', 'rejected'),
      jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id),
      'Amount mismatch detected',
      'webhook_reject_' || p_cashfree_order_id
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount mismatch',
      'payment_id', v_payment.id
    );
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'verified',
    cashfree_cf_payment_id = p_cf_payment_id,
    cashfree_order_status = 'PAID',
    verified_at = now(),
    verified_by = NULL,
    updated_at = now()
  WHERE id = v_payment.id;

  -- Signal to the trigger that this is a legitimate Cashfree webhook verification
  PERFORM set_config('app.cashfree_webhook_verified', 'true', true);

  UPDATE public.campaigns
  SET
    launch_payment_status = 'verified',
    status = 'open'
  WHERE id = v_payment.campaign_id AND status = 'draft';

  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE id = v_payment.campaign_id AND status != 'draft';

  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    before_state, after_state, metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, NULL, 'system',
    'campaign_payment_verified_cashfree', 'campaign', v_payment.campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = v_payment.campaign_id),
    jsonb_build_object('payment_status', v_payment.payment_status),
    jsonb_build_object('payment_status', 'verified', 'campaign_status', 'open'),
    jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id, 'total_payable_paise', v_payment.total_payable_paise),
    'webhook_verify_' || p_cashfree_order_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', 'verified',
    'campaign_id', v_payment.campaign_id,
    'campaign_status', 'open'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cashfree_webhook(text, text, numeric) TO service_role;

-- ── 3. Verification ─────────────────────────────────────────────────────────

SELECT 'verify_cashfree_webhook' AS rpc,
  to_regprocedure('public.verify_cashfree_webhook(text,text,numeric)') IS NOT NULL AS exists;

SELECT 'enforce_campaign_launch_payment_integrity' AS trigger_fn,
  to_regprocedure('public.enforce_campaign_launch_payment_integrity()') IS NOT NULL AS exists;
