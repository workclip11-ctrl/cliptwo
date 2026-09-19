-- ============================================================================
-- CASHFREE INTEGRATION — IDEMPOTENT MIGRATION
-- ============================================================================
-- Run AFTER: campaign-launch-payments.sql, security-hardening-migration.sql
--
-- This migration is fully idempotent — safe to run multiple times.
-- All column additions use IF NOT EXISTS.
-- All function definitions use CREATE OR REPLACE.
-- All index creations use IF NOT EXISTS.
--
-- To execute: paste into Supabase Dashboard → SQL Editor → Run
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_order_id'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_payment_session_id'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_payment_session_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_flow'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_flow text NOT NULL DEFAULT 'utr'
      CHECK (cashfree_flow IN ('utr', 'cashfree'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_order_status'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_order_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_cf_payment_id'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_cf_payment_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_attempt_number'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_attempt_number integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'cashfree_attempts_used'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN cashfree_attempts_used integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ── 2. Indexes ──────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_launch_payments_cashfree_order_id
  ON public.campaign_launch_payments(cashfree_order_id)
  WHERE cashfree_order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_launch_payments_cashfree_active
  ON public.campaign_launch_payments(campaign_id)
  WHERE cashfree_flow = 'cashfree'
    AND payment_status IN ('reserving', 'submitted')
    AND cashfree_order_id IS NOT NULL;

-- ── 3. RPC: reserve_cashfree_payment_attempt ────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_cashfree_payment_attempt(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_campaign record;
  v_attempt_number integer;
  v_platform_fee_paise integer;
  v_total_payable_paise integer;
  v_budget_paise integer;
  v_order_id text;
  v_payment record;
BEGIN
  v_creator_id := auth.uid();
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_creator_id AND role = 'creator' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active creators can submit campaign payments';
  END IF;

  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = p_campaign_id AND created_by = v_creator_id;

  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'Campaign not found or access denied';
  END IF;

  IF v_campaign.status != 'draft' THEN
    RAISE EXCEPTION 'Cashfree payment is only available for draft campaigns';
  END IF;

  SELECT id, cashfree_order_id, cashfree_payment_session_id, payment_status,
         cashfree_order_status, cashfree_attempt_number
  INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
    AND cashfree_flow = 'cashfree'
    AND payment_status IN ('reserving', 'submitted')
    AND cashfree_order_id IS NOT NULL
  FOR UPDATE;

  IF v_payment IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'reserved', false,
      'reused', true,
      'payment_id', v_payment.id,
      'order_id', v_payment.cashfree_order_id,
      'attempt_number', v_payment.cashfree_attempt_number,
      'payment_session_id', v_payment.cashfree_payment_session_id,
      'payment_status', v_payment.payment_status,
      'message', 'Reusing existing active Cashfree payment'
    );
  END IF;

  SELECT id, payment_status INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
  FOR UPDATE;

  IF v_payment IS NOT NULL AND v_payment.payment_status NOT IN ('rejected', 'pending') THEN
    RAISE EXCEPTION 'A verified/submitted payment already exists for this campaign';
  END IF;

  v_budget_paise := (v_campaign.budget * 100)::integer;
  v_platform_fee_paise := (v_campaign.budget * 100 * 0.10)::integer;
  v_total_payable_paise := v_budget_paise + v_platform_fee_paise;

  UPDATE public.campaigns
  SET cashfree_attempts_used = cashfree_attempts_used + 1
  WHERE id = p_campaign_id
  RETURNING cashfree_attempts_used INTO v_attempt_number;

  v_order_id := 'cliptwo_' || p_campaign_id::text || '_attempt_' || v_attempt_number;

  IF v_payment IS NOT NULL THEN
    UPDATE public.campaign_launch_payments
    SET
      cashfree_order_id = v_order_id,
      cashfree_flow = 'cashfree',
      cashfree_order_status = 'RESERVING',
      cashfree_attempt_number = v_attempt_number,
      payment_status = 'reserving',
      submitted_at = now(),
      campaign_budget_rupees = v_campaign.budget,
      platform_fee_paise = v_platform_fee_paise,
      total_payable_paise = v_total_payable_paise,
      utr_reference = NULL,
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;
  ELSE
    INSERT INTO public.campaign_launch_payments (
      campaign_id, creator_id, campaign_budget_rupees,
      platform_fee_paise, total_payable_paise,
      payment_status, cashfree_order_id,
      cashfree_flow, cashfree_order_status, cashfree_attempt_number,
      submitted_at
    ) VALUES (
      p_campaign_id, v_creator_id, v_campaign.budget,
      v_platform_fee_paise, v_total_payable_paise,
      'reserving', v_order_id,
      'cashfree', 'RESERVING', v_attempt_number,
      now()
    ) RETURNING * INTO v_payment;
  END IF;

  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    after_state, metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_creator_id, 'creator',
    'cashfree_payment_reserved', 'campaign', p_campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
    jsonb_build_object('payment_status', 'reserving', 'cashfree_order_id', v_order_id, 'attempt_number', v_attempt_number),
    jsonb_build_object('campaign_budget_rupees', v_campaign.budget, 'platform_fee_paise', v_platform_fee_paise, 'total_payable_paise', v_total_payable_paise),
    'cashfree_reserve_' || p_campaign_id::text || '_' || v_attempt_number::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'reserved', true,
    'reused', false,
    'payment_id', v_payment.id,
    'order_id', v_order_id,
    'attempt_number', v_attempt_number,
    'payment_status', 'reserving',
    'message', 'Payment attempt reserved'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_cashfree_payment_attempt(uuid) TO authenticated;

-- ── 4. RPC: confirm_cashfree_payment_attempt ────────────────────────────────

CREATE OR REPLACE FUNCTION public.confirm_cashfree_payment_attempt(
  p_campaign_id uuid,
  p_cashfree_payment_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_payment record;
BEGIN
  v_creator_id := auth.uid();
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_creator_id AND role = 'creator' AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only active creators can submit campaign payments';
  END IF;

  IF p_cashfree_payment_session_id IS NULL OR length(trim(p_cashfree_payment_session_id)) = 0 THEN
    RAISE EXCEPTION 'Cashfree payment session ID is required';
  END IF;

  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
    AND creator_id = v_creator_id
    AND cashfree_flow = 'cashfree'
    AND payment_status = 'reserving'
    AND cashfree_order_id IS NOT NULL
  FOR UPDATE;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'No active Cashfree reservation found for this campaign';
  END IF;

  UPDATE public.campaign_launch_payments
  SET
    cashfree_payment_session_id = trim(p_cashfree_payment_session_id),
    cashfree_order_status = 'ACTIVE',
    payment_status = 'submitted',
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  UPDATE public.campaigns
  SET launch_payment_status = 'submitted'
  WHERE id = p_campaign_id AND launch_payment_status IS DISTINCT FROM 'submitted';

  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id, entity_label,
    after_state, metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_creator_id, 'creator',
    'cashfree_payment_confirmed', 'campaign', p_campaign_id::text,
    (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
    jsonb_build_object('payment_status', 'submitted', 'cashfree_order_id', v_payment.cashfree_order_id),
    jsonb_build_object('attempt_number', v_payment.cashfree_attempt_number),
    'cashfree_confirm_' || p_campaign_id::text || '_' || v_payment.cashfree_attempt_number::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', 'submitted',
    'cashfree_order_id', v_payment.cashfree_order_id,
    'attempt_number', v_payment.cashfree_attempt_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_cashfree_payment_attempt(uuid, text) TO authenticated;

-- ── 5. RPC: release_cashfree_payment_reservation ────────────────────────────

CREATE OR REPLACE FUNCTION public.release_cashfree_payment_reservation(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_payment record;
BEGIN
  v_creator_id := auth.uid();
  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
    AND creator_id = v_creator_id
    AND cashfree_flow = 'cashfree'
    AND payment_status = 'reserving'
  FOR UPDATE;

  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  DELETE FROM public.campaign_launch_payments
  WHERE id = v_payment.id;

  UPDATE public.campaigns
  SET launch_payment_status = 'pending'
  WHERE id = p_campaign_id AND launch_payment_status = 'submitted';

  INSERT INTO public.audit_logs (
    id, actor_id, actor, action, entity_type, entity_id,
    metadata, idempotency_key
  ) VALUES (
    gen_random_uuid()::text, v_creator_id, 'creator',
    'cashfree_payment_reservation_released', 'campaign', p_campaign_id::text,
    jsonb_build_object('cashfree_order_id', v_payment.cashfree_order_id, 'attempt_number', v_payment.cashfree_attempt_number),
    'cashfree_release_' || p_campaign_id::text || '_' || v_payment.cashfree_attempt_number::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'released', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_cashfree_payment_reservation(uuid) TO authenticated;

-- ── 6. RPC: verify_cashfree_webhook (service_role only) ─────────────────────

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
      gen_random_uuid()::text, '00000000-0000-0000-0000-000000000000', 'system',
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
    verified_by = '00000000-0000-0000-0000-000000000000',
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
    gen_random_uuid()::text, '00000000-0000-0000-0000-000000000000', 'system',
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

-- ── 7. RPC: reject_cashfree_webhook (service_role only) ─────────────────────

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
      gen_random_uuid()::text, '00000000-0000-0000-0000-000000000000', 'system',
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
    gen_random_uuid()::text, '00000000-0000-0000-0000-000000000000', 'system',
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

-- ── 8. Verification ─────────────────────────────────────────────────────────
-- Run this section AFTER migration to confirm all objects exist.
-- All 5 checks must return non-null for the migration to be complete.

SELECT 'reserve_cashfree_payment_attempt' AS rpc,
  to_regprocedure('public.reserve_cashfree_payment_attempt(uuid)') IS NOT NULL AS exists;

SELECT 'confirm_cashfree_payment_attempt' AS rpc,
  to_regprocedure('public.confirm_cashfree_payment_attempt(uuid,text)') IS NOT NULL AS exists;

SELECT 'release_cashfree_payment_reservation' AS rpc,
  to_regprocedure('public.release_cashfree_payment_reservation(uuid)') IS NOT NULL AS exists;

SELECT 'verify_cashfree_webhook' AS rpc,
  to_regprocedure('public.verify_cashfree_webhook(text,text,numeric)') IS NOT NULL AS exists;

SELECT 'reject_cashfree_webhook' AS rpc,
  to_regprocedure('public.reject_cashfree_webhook(text,text,text)') IS NOT NULL AS exists;

-- Column checks
SELECT 'campaign_launch_payments.cashfree_order_id' AS col,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_order_id') AS exists
UNION ALL
SELECT 'campaign_launch_payments.cashfree_payment_session_id',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_payment_session_id')
UNION ALL
SELECT 'campaign_launch_payments.cashfree_flow',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_flow')
UNION ALL
SELECT 'campaign_launch_payments.cashfree_order_status',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_order_status')
UNION ALL
SELECT 'campaign_launch_payments.cashfree_cf_payment_id',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_cf_payment_id')
UNION ALL
SELECT 'campaign_launch_payments.cashfree_attempt_number',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaign_launch_payments' AND column_name='cashfree_attempt_number')
UNION ALL
SELECT 'campaigns.cashfree_attempts_used',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='cashfree_attempts_used');

-- Index checks
SELECT 'idx_campaign_launch_payments_cashfree_order_id' AS idx,
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='idx_campaign_launch_payments_cashfree_order_id') AS exists
UNION ALL
SELECT 'idx_campaign_launch_payments_cashfree_active',
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='idx_campaign_launch_payments_cashfree_active');
