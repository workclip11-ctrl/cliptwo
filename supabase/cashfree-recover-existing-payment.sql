-- ============================================================================
-- ONE-TIME RECOVERY: Cashfree Sandbox Payment Stuck Due to Trigger FK Violation
-- ============================================================================
-- Date: 2026-09-19
-- Purpose: Recover a Cashfree sandbox payment that was successfully paid but
--          remained stuck at 'submitted' because:
--          1. The old verify_cashfree_webhook() used a fake UUID for verified_by
--             which violated the FK constraint on auth.users(id)
--          2. The trigger enforce_campaign_launch_payment_integrity blocked
--             the campaign status update because service_role has no JWT user
--
-- This file:
--   1. Applies the trigger fix (idempotent)
--   2. Applies the verify_cashfree_webhook fix (idempotent)
--   3. Runs precondition checks
--   4. Calls verify_cashfree_webhook() — the SAME RPC the real webhook uses
--   5. Shows post-verification state
--
-- WHY DIRECT UPDATE IS PROHIBITED:
--   - Direct UPDATE bypasses the verification RPC's amount validation
--   - Direct UPDATE bypasses the audit_logs insert (no traceability)
--   - Direct UPDATE could be used to verify un-paid orders (security risk)
--   - The RPC enforces: payment must be 'submitted', amount must match
--   - The RPC creates an audit trail with idempotency_key
--   - Using the RPC exercises the same code path as the real webhook
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 0: Configuration (no secrets — these are public identifiers)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '=== ONE-TIME CASHFREE PAYMENT RECOVERY ===';
  RAISE NOTICE 'Campaign: Cashfree Sandbox Test';
  RAISE NOTICE 'Campaign ID: ef769e74-58f4-4df9-9c5f-de3333f1b577';
  RAISE NOTICE 'Cashfree Order ID: cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1';
  RAISE NOTICE 'Cashfree Payment ID: 1454762304210684928';
  RAISE NOTICE 'Amount: 110 INR / 11000 paise';
  RAISE NOTICE 'Reason: Old function used fake UUID verified_by = 000000... which violated FK';
  RAISE NOTICE '        New function uses verified_by = NULL (no FK violation)';
  RAISE NOTICE '================================================';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Apply trigger fix (idempotent — safe to run multiple times)
-- ─────────────────────────────────────────────────────────────────────────────
-- The trigger must allow verify_cashfree_webhook (service_role, no JWT user)
-- to set launch_payment_status = 'verified'. It checks the session variable
-- app.cashfree_webhook_verified which the RPC sets before the UPDATE.

CREATE OR REPLACE FUNCTION public.enforce_campaign_launch_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.launch_payment_status IS DISTINCT FROM OLD.launch_payment_status THEN
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

RAISE NOTICE 'Step 1 PASS: Trigger fixed (allows Cashfree webhook verification)';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Apply verify_cashfree_webhook fix (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
-- Sets verified_by = NULL (not a fake UUID) to avoid FK violation.
-- Sets actor_id = NULL in audit logs to avoid FK violation.
-- Sets app.cashfree_webhook_verified session variable to pass trigger check.

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

RAISE NOTICE 'Step 2 PASS: verify_cashfree_webhook fixed (NULL verified_by + session variable)';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Precondition checks
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_campaign RECORD;
  v_payment RECORD;
BEGIN
  -- Check campaign exists
  SELECT id, title, status, launch_payment_status, budget
  INTO v_campaign
  FROM public.campaigns
  WHERE id = 'ef769e74-58f4-4df9-9c5f-de3333f1b577';

  IF v_campaign IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Campaign not found';
  END IF;

  RAISE NOTICE 'Step 3a PASS: Campaign found — title=%, status=%, launch_payment_status=%',
    v_campaign.title, v_campaign.status, v_campaign.launch_payment_status;

  -- Check payment exists and matches order
  SELECT id, campaign_id, payment_status, cashfree_order_id, cashfree_cf_payment_id,
         cashfree_order_status, total_payable_paise
  INTO v_payment
  FROM public.campaign_launch_payments
  WHERE cashfree_order_id = 'cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1';

  IF v_payment IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Payment record not found for order';
  END IF;

  RAISE NOTICE 'Step 3b PASS: Payment found — id=%, payment_status=%, total_payable_paise=%',
    v_payment.id, v_payment.payment_status, v_payment.total_payable_paise;

  -- Verify amount
  IF v_payment.total_payable_paise != 11000 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Expected 11000 paise, got %', v_payment.total_payable_paise;
  END IF;

  RAISE NOTICE 'Step 3c PASS: Amount matches (11000 paise = 110 INR)';

  -- Verify payment is in submitted status
  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Payment status is %, expected submitted', v_payment.payment_status;
  END IF;

  RAISE NOTICE 'Step 3d PASS: Payment status is submitted (precondition for verify RPC)';

  -- Verify campaign is in draft status
  IF v_campaign.status != 'draft' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Campaign status is %, expected draft', v_campaign.status;
  END IF;

  RAISE NOTICE 'Step 3e PASS: Campaign status is draft (will transition to open)';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Invoke the verification RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the SAME RPC that the real Cashfree webhook handler calls.
-- It validates amount, sets payment_status = verified, updates campaign to open,
-- and creates an audit log entry.

SELECT verify_cashfree_webhook(
  'cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1',
  '1454762304210684928',
  110
) AS verification_result;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Post-verification state
-- ─────────────────────────────────────────────────────────────────────────────

-- Campaign state
SELECT
  'campaign' AS entity,
  id,
  title,
  status,
  launch_payment_status
FROM public.campaigns
WHERE id = 'ef769e74-58f4-4df9-9c5f-de3333f1b577';

-- Payment state
SELECT
  'payment' AS entity,
  id,
  payment_status,
  cashfree_order_id,
  cashfree_cf_payment_id,
  cashfree_order_status,
  verified_by,
  verified_at,
  total_payable_paise
FROM public.campaign_launch_payments
WHERE cashfree_order_id = 'cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1';

-- Audit trail
SELECT
  'audit' AS entity,
  action,
  actor,
  actor_id,
  before_state,
  after_state,
  metadata,
  created_at
FROM public.audit_logs
WHERE entity_id = 'ef769e74-58f4-4df9-9c5f-de3333f1b577'
  AND idempotency_key = 'webhook_verify_cliptwo_ef769e74-58f4-4df9-9c5f-de3333f1b577_attempt_1'
ORDER BY created_at DESC
LIMIT 1;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Expected final state
-- ─────────────────────────────────────────────────────────────────────────────
-- campaign:
--   status = open
--   launch_payment_status = verified
--
-- payment:
--   payment_status = verified
--   cashfree_order_status = PAID
--   cashfree_cf_payment_id = 1454762304210684928
--   verified_by = NULL (automated Cashfree verification, not a human admin)
--   verified_at = now()
--
-- audit:
--   action = campaign_payment_verified_cashfree
--   actor = system
--   actor_id = NULL
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=== RECOVERY COMPLETE ===';
  RAISE NOTICE 'If Step 4 returned success=true, the payment is now verified.';
  RAISE NOTICE 'Campaign should now be open for clippers to join.';
END $$;
