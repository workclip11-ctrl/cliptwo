-- ============================================================================
-- CASHFREE VERIFIED_BY FIX — IDEMPOTENT MIGRATION
-- ============================================================================
-- Fix: Cashfree webhook verification fails with FK violation because
-- verified_by = '00000000-0000-0000-0000-000000000000' does not exist in
-- auth.users. The verified_by column has REFERENCES auth.users(id).
--
-- Similarly, audit_logs.actor_id has REFERENCES auth.users(id), so the
-- same fake UUID in audit log inserts would also fail.
--
-- Fix: Set verified_by = NULL for automated Cashfree verification.
-- Set actor_id = NULL for Cashfree webhook audit logs.
-- The 'actor' text column continues to record 'system' for identification.
--
-- This does NOT affect admin UTR verification (verify_campaign_launch_payment),
-- which correctly uses auth.uid() — a real admin UUID.
--
-- Run AFTER: 20250101000000_cashfree_integration.sql
-- Safe to run multiple times (idempotent CREATE OR REPLACE).
-- ============================================================================

-- ── 1. Fix verify_cashfree_webhook ──────────────────────────────────────────
-- Sets verified_by = NULL (not a fake UUID) for automated Cashfree verification.
-- Sets actor_id = NULL in audit logs (not a fake UUID).

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

-- ── 2. Fix reject_cashfree_webhook ──────────────────────────────────────────
-- Sets actor_id = NULL in audit logs (not a fake UUID).

CREATE OR REPLACE FUNCTION public.reject_cashfree_webhook(
  p_cashfree_order_id text,
  p_cf_payment_id text,
  p_failure_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE cashfree_order_id = p_cashfree_order_id
  FOR UPDATE;

  IF v_payment IS NULL THEN
    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id,
      metadata, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, NULL, 'system',
      'cashfree_webhook_unknown_order', 'campaign', 'unknown',
      jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id),
      'webhook_unknown_' || p_cashfree_order_id
    );

    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  IF v_payment.payment_status IN ('rejected', 'verified') THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'payment_status', v_payment.payment_status,
      'idempotent', true
    );
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    payment_status = 'rejected',
    cashfree_cf_payment_id = p_cf_payment_id,
    cashfree_order_status = 'FAILED',
    rejection_reason = COALESCE(p_failure_reason, 'Payment failed via Cashfree'),
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
    'campaign_payment_rejected_cashfree', 'campaign', v_payment.campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = v_payment.campaign_id),
    jsonb_build_object('payment_status', v_payment.payment_status),
    jsonb_build_object('payment_status', 'rejected'),
    jsonb_build_object('cashfree_order_id', p_cashfree_order_id, 'cf_payment_id', p_cf_payment_id),
    COALESCE(p_failure_reason, 'Payment failed via Cashfree'),
    'webhook_reject_' || p_cashfree_order_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', 'rejected',
    'campaign_id', v_payment.campaign_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_cashfree_webhook(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_cashfree_webhook(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_cashfree_webhook(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_cashfree_webhook(text, text, text) TO service_role;

-- ── 3. Verification ─────────────────────────────────────────────────────────

-- Verify verify_cashfree_webhook exists
SELECT 'verify_cashfree_webhook' AS rpc,
  to_regprocedure('public.verify_cashfree_webhook(text,text,numeric)') IS NOT NULL AS exists;

-- Verify reject_cashfree_webhook exists
SELECT 'reject_cashfree_webhook' AS rpc,
  to_regprocedure('public.reject_cashfree_webhook(text,text,text)') IS NOT NULL AS exists;
