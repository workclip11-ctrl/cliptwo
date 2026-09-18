-- ============================================================================
-- CAMPAIGN LAUNCH PAYMENTS — CASHFREE INTEGRATION
-- ============================================================================
-- Adds Cashfree sandbox payment support alongside existing UTR flow.
-- Creator can choose UTR or Cashfree checkout. Both paths converge at
-- payment_status = 'verified' → campaign status = 'open'.
--
-- Run order: AFTER campaign-launch-payments.sql, security-hardening-migration.sql,
--            campaign-launch-payment-integrity.sql
--
-- Security notes:
--   - verify_cashfree_webhook() is SECURITY DEFINER, service_role ONLY
--   - reject_cashfree_webhook() is SECURITY DEFINER, service_role ONLY
--   - submit_campaign_launch_payment_cashfree() is SECURITY DEFINER, authenticated ONLY
--   - enforce_campaign_open_requires_verified trigger prevents open without verified
--   - enforce_campaign_launch_payment_integrity trigger prevents self-verification
--   - All Cashfree verifications use FOR UPDATE row locking
--   - verified_by uses 'system' for automated gateway verification
-- ============================================================================

-- ── 1. Add Cashfree columns to campaign_launch_payments ─────────────────────

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
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_launch_payments_cashfree_order_id
  ON public.campaign_launch_payments(cashfree_order_id)
  WHERE cashfree_order_id IS NOT NULL;

-- ── 2. Submit campaign launch payment via Cashfree (Creator) ────────────────

CREATE OR REPLACE FUNCTION public.submit_campaign_launch_payment_cashfree(
  p_campaign_id uuid,
  p_cashfree_order_id text,
  p_cashfree_payment_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
  v_campaign record;
  v_platform_fee_paise integer;
  v_total_payable_paise integer;
  v_budget_paise integer;
  v_existing record;
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

  IF p_cashfree_order_id IS NULL OR length(trim(p_cashfree_order_id)) = 0 THEN
    RAISE EXCEPTION 'Cashfree order ID is required';
  END IF;

  IF p_cashfree_payment_session_id IS NULL OR length(trim(p_cashfree_payment_session_id)) = 0 THEN
    RAISE EXCEPTION 'Cashfree payment session ID is required';
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

  v_budget_paise := (v_campaign.budget * 100)::integer;
  v_platform_fee_paise := (v_campaign.budget * 100 * 0.10)::integer;
  v_total_payable_paise := v_budget_paise + v_platform_fee_paise;

  -- Lock existing row to prevent concurrent inserts (Fix #4)
  SELECT id, payment_status INTO v_existing
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
  FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    IF v_existing.payment_status NOT IN ('rejected', 'pending') THEN
      RAISE EXCEPTION 'A verified/submitted payment already exists for this campaign';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = p_campaign_id AND status = 'draft'
    ) THEN
      RAISE EXCEPTION 'Cannot resubmit payment: campaign is no longer draft';
    END IF;

    UPDATE public.campaign_launch_payments
    SET
      cashfree_order_id = trim(p_cashfree_order_id),
      cashfree_payment_session_id = trim(p_cashfree_payment_session_id),
      cashfree_flow = 'cashfree',
      cashfree_order_status = 'ACTIVE',
      payment_status = 'submitted',
      submitted_at = now(),
      utr_reference = NULL,
      rejection_reason = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_payment;

    UPDATE public.campaigns
    SET launch_payment_status = 'submitted'
    WHERE id = p_campaign_id;

    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      after_state, metadata, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, v_creator_id, 'creator',
      'campaign_payment_submitted_cashfree', 'campaign', p_campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
      jsonb_build_object('payment_status', 'submitted', 'cashfree_order_id', trim(p_cashfree_order_id)),
      jsonb_build_object('campaign_budget_rupees', v_campaign.budget, 'platform_fee_paise', v_platform_fee_paise, 'total_payable_paise', v_total_payable_paise),
      'payment_submit_cashfree_' || p_campaign_id::text || '_' || extract(epoch from now())::text
    );
  ELSE
    INSERT INTO public.campaign_launch_payments (
      campaign_id, creator_id, campaign_budget_rupees,
      platform_fee_paise, total_payable_paise,
      payment_status, cashfree_order_id, cashfree_payment_session_id,
      cashfree_flow, cashfree_order_status, submitted_at
    ) VALUES (
      p_campaign_id, v_creator_id, v_campaign.budget,
      v_platform_fee_paise, v_total_payable_paise,
      'submitted', trim(p_cashfree_order_id), trim(p_cashfree_payment_session_id),
      'cashfree', 'ACTIVE', now()
    ) RETURNING * INTO v_payment;

    UPDATE public.campaigns
    SET launch_payment_status = 'submitted'
    WHERE id = p_campaign_id;

    INSERT INTO public.audit_logs (
      id, actor_id, actor, action, entity_type, entity_id, entity_label,
      after_state, metadata, idempotency_key
    ) VALUES (
      gen_random_uuid()::text, v_creator_id, 'creator',
      'campaign_payment_submitted_cashfree', 'campaign', p_campaign_id::text,
      (SELECT title FROM public.campaigns WHERE id = p_campaign_id),
      jsonb_build_object('payment_status', 'submitted', 'cashfree_order_id', trim(p_cashfree_order_id)),
      jsonb_build_object('campaign_budget_rupees', v_campaign.budget, 'platform_fee_paise', v_platform_fee_paise, 'total_payable_paise', v_total_payable_paise),
      'payment_submit_cashfree_' || p_campaign_id::text || '_' || extract(epoch from now())::text
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'payment_status', v_payment.payment_status,
    'campaign_id', p_campaign_id,
    'cashfree_order_id', v_payment.cashfree_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_campaign_launch_payment_cashfree(uuid, text, text) TO authenticated;

-- ── 3. Verify Cashfree webhook (atomic, service-role only) ─────────────────
-- Fix #4: Requires payment_status = 'submitted', uses FOR UPDATE row lock
-- Fix #8: verified_by uses 'system' (not creator) for automated verification

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
  -- Lock the row to prevent concurrent verification attempts
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE cashfree_order_id = p_cashfree_order_id
  FOR UPDATE;

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for order';
  END IF;

  -- Idempotent: already verified → return success
  IF v_payment.payment_status = 'verified' THEN
    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'payment_status', 'verified',
      'campaign_id', v_payment.campaign_id,
      'idempotent', true
    );
  END IF;

  -- Only 'submitted' payments can be verified (Fix #4)
  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'Payment is not in submitted status';
  END IF;

  -- Amount verification
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
      gen_random_uuid()::text, v_payment.creator_id, 'system',
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

  -- Atomic verification — all state changes in one transaction
  -- Fix #8: verified_by = 'system' for automated Cashfree verification
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

-- ── 4. Reject Cashfree webhook (service-role only) ────────────────────────

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
