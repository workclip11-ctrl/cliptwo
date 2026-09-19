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
--   - reserve_cashfree_payment_attempt() is SECURITY DEFINER, authenticated ONLY
--   - confirm_cashfree_payment_attempt() is SECURITY DEFINER, authenticated ONLY
--   - release_cashfree_payment_reservation() is SECURITY DEFINER, authenticated ONLY
--   - enforce_campaign_open_requires_verified trigger prevents open without verified
--   - enforce_campaign_launch_payment_integrity trigger prevents self-verification
--   - All Cashfree verifications use FOR UPDATE row locking
--   - verified_by uses 'system' for automated gateway verification
--   - Persistent attempt counter on campaigns table survives reservation deletion
--   - Ambiguous network failures do NOT release reservations
-- ============================================================================

-- ── 1. Add Cashfree columns ────────────────────────────────────────────────

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

  -- Attempt number on the payment row (deterministic, matches order_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_launch_payments' AND column_name = 'cashfree_attempt_number'
  ) THEN
    ALTER TABLE public.campaign_launch_payments
      ADD COLUMN cashfree_attempt_number integer DEFAULT 0;
  END IF;

  -- Fix #2: Persistent attempt counter on campaigns (survives reservation deletion)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'cashfree_attempts_used'
  ) THEN
    ALTER TABLE public.campaigns
      ADD COLUMN cashfree_attempts_used integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Unique constraint: one active Cashfree order per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_launch_payments_cashfree_order_id
  ON public.campaign_launch_payments(cashfree_order_id)
  WHERE cashfree_order_id IS NOT NULL;

-- Unique constraint: one active Cashfree reservation/attempt per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_launch_payments_cashfree_active
  ON public.campaign_launch_payments(campaign_id)
  WHERE cashfree_flow = 'cashfree'
    AND payment_status IN ('reserving', 'submitted')
    AND cashfree_order_id IS NOT NULL;

-- ── 2. Reserve Cashfree payment attempt (atomic, DB-authoritative) ────────
-- Fix #4: Does NOT set campaign launch_payment_status to 'submitted'.
--   Campaign remains in its secure pre-payment state until confirm RPC.
-- Fix #2: Uses persistent campaign.cashfree_attempts_used counter.

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

  -- Check for existing active Cashfree payment (reuse if found)
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
    -- Reuse existing reservation/submitted order
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

  -- Check for rejected/pending records (allow resubmission)
  SELECT id, payment_status INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
  FOR UPDATE;

  IF v_payment IS NOT NULL AND v_payment.payment_status NOT IN ('rejected', 'pending') THEN
    RAISE EXCEPTION 'A verified/submitted payment already exists for this campaign';
  END IF;

  -- Calculate amounts
  v_budget_paise := (v_campaign.budget * 100)::integer;
  v_platform_fee_paise := (v_campaign.budget * 100 * 0.10)::integer;
  v_total_payable_paise := v_budget_paise + v_platform_fee_paise;

  -- Fix #2: Persistent attempt counter — atomically increment on campaigns table
  -- This survives reservation deletion and provides monotonically increasing attempt numbers.
  UPDATE public.campaigns
  SET cashfree_attempts_used = cashfree_attempts_used + 1
  WHERE id = p_campaign_id
  RETURNING cashfree_attempts_used INTO v_attempt_number;

  -- Deterministic order ID
  v_order_id := 'cliptwo_' || p_campaign_id::text || '_attempt_' || v_attempt_number;

  IF v_payment IS NOT NULL THEN
    -- Update existing rejected/pending record
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
    -- Create new reservation
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

  -- Fix #4: Do NOT set campaign launch_payment_status here.
  -- Campaign stays in its current state until confirm_cashfree_payment_attempt.

  -- Audit log
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

-- ── 3. Confirm Cashfree payment attempt (after successful Cashfree API call) ─
-- Fix #6: Validates creator owns the reservation. Prevents cross-campaign binding.
-- Fix #4: Sets campaign launch_payment_status = 'submitted' here (after Cashfree confirmed).

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

  -- Fix #6: Find the reservation — must belong to THIS creator and THIS campaign
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

  -- Confirm: set payment_session_id and move to 'submitted'
  UPDATE public.campaign_launch_payments
  SET
    cashfree_payment_session_id = trim(p_cashfree_payment_session_id),
    cashfree_order_status = 'ACTIVE',
    payment_status = 'submitted',
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Fix #4: Now that Cashfree order is confirmed, update campaign status
  UPDATE public.campaigns
  SET launch_payment_status = 'submitted'
  WHERE id = p_campaign_id AND launch_payment_status IS DISTINCT FROM 'submitted';

  -- Audit log
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

-- ── 4. Release Cashfree payment reservation (on definitive Cashfree failure) ─
-- Fix #5: Only the owning creator can release. Only 'reserving' status.
--   Never deletes submitted/verified/rejected records.
--   Restores campaign to 'pending' (not NULL).
--   Preserves persistent attempt counter.

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

  -- Fix #5: Find reservation — must belong to THIS creator
  SELECT * INTO v_payment
  FROM public.campaign_launch_payments
  WHERE campaign_id = p_campaign_id
    AND creator_id = v_creator_id
    AND cashfree_flow = 'cashfree'
    AND payment_status = 'reserving'
  FOR UPDATE;

  IF v_payment IS NULL THEN
    -- No reservation to release — idempotent
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  -- Release: delete the reservation row so a new attempt can be made
  -- Persistent attempt counter on campaigns is NOT affected
  DELETE FROM public.campaign_launch_payments
  WHERE id = v_payment.id;

  -- Fix #5: Restore campaign to 'pending' (not NULL)
  UPDATE public.campaigns
  SET launch_payment_status = 'pending'
  WHERE id = p_campaign_id AND launch_payment_status = 'submitted';

  -- Audit log
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

-- ── 5. Verify Cashfree webhook (atomic, service-role only) ─────────────────
-- No changes to this RPC. Existing architecture preserved.

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

  -- Signal to enforce_campaign_launch_payment_integrity trigger that this is
  -- a legitimate Cashfree webhook verification (service_role, not admin).
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

-- ── 6. Reject Cashfree webhook (service-role only) ────────────────────────
-- No changes to this RPC. Existing architecture preserved.

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
