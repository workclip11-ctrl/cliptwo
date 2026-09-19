-- ============================================================================
-- ONE-TIME RECOVERY: Cashfree Sandbox Payment
-- ============================================================================
-- Date: 2026-09-19
--
-- PURPOSE:
--   Recover a Cashfree sandbox payment that was successfully paid but remained
--   stuck at 'submitted' because:
--   1. The old verify_cashfree_webhook() used a fake UUID for verified_by
--      which violated the FK constraint on auth.users(id).
--   2. The trigger enforce_campaign_launch_payment_integrity blocked the
--      campaign status update because service_role has no JWT user.
--
-- BOTH FIXES MUST BE APPLIED FIRST:
--   Migration 11: 20250101000000_cashfree_integration.sql
--   Migration 12: 20250101000001_cashfree_verified_by_fix.sql
--   Migration 13: 20250101000002_cashfree_trigger_fix.sql
--
-- THIS FILE:
--   1. Verifies the trigger fix is applied (precondition)
--   2. Verifies the function fix is applied (precondition)
--   3. Runs precondition checks on campaign/payment
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
--
-- IDEMPOTENCY:
--   This file is safe to run multiple times. The RPC is idempotent:
--   if the payment is already verified, it returns success with idempotent=true.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Verify function fix is applied
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Check that verify_cashfree_webhook exists
  IF to_regprocedure('public.verify_cashfree_webhook(text,text,numeric)') IS NULL THEN
    RAISE EXCEPTION 'verify_cashfree_webhook function not found. Run migration 12 first.';
  END IF;

  -- Check that the function uses verified_by = NULL (not the fake UUID)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'verify_cashfree_webhook'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%00000000-0000-0000-0000-000000000000%'
  ) THEN
    RAISE EXCEPTION 'verify_cashfree_webhook still uses fake UUID. Run migration 12 first.';
  END IF;

  RAISE NOTICE 'Step 1 PASS: verify_cashfree_webhook function is the fixed version';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Verify trigger fix is applied
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Check that the trigger function checks for _cf_verify_signal temp table
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'enforce_campaign_launch_payment_integrity'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%_cf_verify_signal%'
  ) THEN
    RAISE EXCEPTION 'Trigger fix not applied. Run migration 13 first.';
  END IF;

  RAISE NOTICE 'Step 2 PASS: Trigger checks for _cf_verify_signal temp table';
END $$;


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

  RAISE NOTICE 'Step 3a: Campaign — title=%, status=%, launch_payment_status=%',
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

  RAISE NOTICE 'Step 3b: Payment — id=%, status=%, total_payable_paise=%',
    v_payment.id, v_payment.payment_status, v_payment.total_payable_paise;

  -- Verify amount
  IF v_payment.total_payable_paise != 11000 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Expected 11000 paise, got %', v_payment.total_payable_paise;
  END IF;

  RAISE NOTICE 'Step 3c: Amount matches (11000 paise = 110 INR)';

  -- Verify payment is in submitted status
  IF v_payment.payment_status != 'submitted' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Payment status is %, expected submitted', v_payment.payment_status;
  END IF;

  RAISE NOTICE 'Step 3d: Payment status is submitted (precondition for verify RPC)';

  -- Verify campaign is in draft status
  IF v_campaign.status != 'draft' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: Campaign status is %, expected draft', v_campaign.status;
  END IF;

  RAISE NOTICE 'Step 3e: Campaign status is draft (will transition to open)';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Invoke the verification RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the SAME RPC that the real Cashfree webhook handler calls.
-- It validates amount, sets payment_status = verified, updates campaign to open,
-- and creates an audit log entry.
--
-- The RPC will:
--   1. Verify payment is in 'submitted' status
--   2. Verify amount matches (110 INR = 11000 paise)
--   3. Update campaign_launch_payments: payment_status = 'verified'
--   4. Create temp table _cf_verify_signal (authorization marker)
--   5. Update campaigns: launch_payment_status = 'verified', status = 'open'
--   6. Insert audit log entry

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
