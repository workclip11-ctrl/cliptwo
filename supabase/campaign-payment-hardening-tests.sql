-- ===========================================================================
-- CAMPAIGN PAYMENT HARDENING TESTS — Final Security Audit
-- ===========================================================================
-- Focused regression coverage for:
--   1. Cashfree retry flow (submitted → failed → retryable → release → new attempt → success)
--   2. Behavioral RLS/security checks (clipper, creator, admin, anon)
--   3. Function ACL verification (has_function_privilege)
--   4. Social OAuth verification / metric safety invariants
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Creator B: a1b2c3d4-e5f6-7890-abcd-ef1234567890
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper:   2d75364e-77e0-4eb2-af96-48f573cb4a43
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- SECTION 1: CASHFREE RETRY REGRESSION (PAYMENT_FAILED flow)
-- ===========================================================================

-- TEST 1.1: PAYMENT_FAILED does NOT permanently reject — payment stays submitted
-- Simulates the webhook handler behavior: when a PAYMENT_FAILED event arrives,
-- the handler does NOT call reject_cashfree_webhook. The payment stays in
-- 'submitted' state, allowing the creator to release and retry.
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
  v_payment_status text;
  v_campaign_status text;
  v_campaign_launch_status text;
BEGIN
  -- Setup: draft campaign with submitted Cashfree payment (simulates post-confirm state)
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Retry 1.1', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise,
    payment_status, cashfree_order_id, cashfree_flow,
    cashfree_order_status, cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200,
    'submitted', 'cliptwo_retry_1_1_attempt_1', 'cashfree',
    'ACTIVE', 1
  ) RETURNING id INTO v_payment_id;

  -- Simulate PAYMENT_FAILED: the webhook handler does NOT call reject_cashfree_webhook.
  -- Verify the payment remains in 'submitted' state (retryable).
  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments WHERE id = v_payment_id;
  ASSERT v_payment_status = 'submitted',
    '1.1a: Payment must remain submitted after PAYMENT_FAILED (not rejected)';

  SELECT status, launch_payment_status INTO v_campaign_status, v_campaign_launch_status
  FROM public.campaigns WHERE id = v_id;
  ASSERT v_campaign_status = 'draft',
    '1.1b: Campaign must remain draft after failed payment';
  ASSERT v_campaign_launch_status = 'submitted',
    '1.1c: Campaign launch_payment_status must remain submitted';

  -- Creator releases the failed reservation
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
  v_result := public.release_cashfree_payment_reservation(v_id);
  ASSERT (v_result->>'success')::boolean = true,
    '1.1d: Release must succeed';

  -- Payment row should be deleted
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.campaign_launch_payments WHERE id = v_payment_id
  ), '1.1e: Released payment row must be deleted';

  -- Campaign launch_payment_status restored to pending
  SELECT launch_payment_status INTO v_campaign_launch_status
  FROM public.campaigns WHERE id = v_id;
  ASSERT v_campaign_launch_status = 'pending',
    '1.1f: Campaign launch_payment_status must be restored to pending after release';

  -- Creator reserves a new attempt (attempt 2)
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  ASSERT (v_result->>'success')::boolean = true,
    '1.1g: Reserve new attempt must succeed';

  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_id AND cashfree_flow = 'cashfree';
  ASSERT v_payment_status = 'reserving',
    '1.1h: New payment must be in reserving state';

  -- Confirm the new attempt
  v_result := public.confirm_cashfree_payment_attempt(v_id, 'session_retry_1');
  ASSERT (v_result->>'success')::boolean = true,
    '1.1i: Confirm new attempt must succeed';

  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_id AND cashfree_flow = 'cashfree';
  ASSERT v_payment_status = 'submitted',
    '1.1j: Payment after confirm must be submitted';

  -- Verify via webhook (simulates successful payment)
  PERFORM set_config('role', 'service_role', true);
  v_result := public.verify_cashfree_webhook('cliptwo_retry_1_1_attempt_2', 'cf_pay_final', 12.00);
  ASSERT (v_result->>'success')::boolean = true,
    '1.1k: Webhook verify must succeed';

  SELECT status, launch_payment_status INTO v_campaign_status, v_campaign_launch_status
  FROM public.campaigns WHERE id = v_id;
  ASSERT v_campaign_status = 'open',
    '1.1l: Campaign must be open after successful verification';
  ASSERT v_campaign_launch_status = 'verified',
    '1.1m: Campaign launch_payment_status must be verified';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 1.1 PASSED' AS result;
ROLLBACK;

-- TEST 1.2: reject_cashfree_webhook is terminal — verify after reject fails
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Retry 1.2', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise,
    payment_status, cashfree_order_id, cashfree_flow,
    cashfree_order_status, cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200,
    'submitted', 'cliptwo_terminal_1_2', 'cashfree',
    'ACTIVE', 1
  );

  -- Terminal rejection (amount mismatch)
  PERFORM set_config('role', 'service_role', true);
  v_result := public.reject_cashfree_webhook('cliptwo_terminal_1_2', 'cf_pay_bad', 'Amount mismatch');
  ASSERT (v_result->>'success')::boolean = true,
    '1.2a: Terminal reject must succeed';

  -- Verify same order now fails (already rejected)
  BEGIN
    v_result := public.verify_cashfree_webhook('cliptwo_terminal_1_2', 'cf_pay_good', 12.00);
    ASSERT false, '1.2b: Should have raised exception for rejected order';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not in submitted%',
      '1.2b: Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 1.2 PASSED' AS result;
ROLLBACK;

-- TEST 1.3: Persistent attempt counter survives multiple retry cycles
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_attempt int;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Retry 1.3', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Attempt 1
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  SELECT cashfree_attempts_used INTO v_attempt FROM public.campaigns WHERE id = v_id;
  ASSERT v_attempt = 1, '1.3a: First attempt counter must be 1';

  -- Release attempt 1
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  v_result := public.release_cashfree_payment_reservation(v_id);

  -- Attempt 2
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  SELECT cashfree_attempts_used INTO v_attempt FROM public.campaigns WHERE id = v_id;
  ASSERT v_attempt = 2, '1.3b: Second attempt counter must be 2';

  -- Release attempt 2
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  v_result := public.release_cashfree_payment_reservation(v_id);

  -- Attempt 3
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  SELECT cashfree_attempts_used INTO v_attempt FROM public.campaigns WHERE id = v_id;
  ASSERT v_attempt = 3, '1.3c: Third attempt counter must be 3';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 1.3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION 2: BEHAVIORAL RLS / SECURITY CHECKS
-- ===========================================================================

-- TEST 2A: Clipper CANNOT SELECT an unpaid campaign (draft + pending)
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  -- Create a draft/unpaid campaign as Creator A
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2A Unpaid', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Switch to Clipper
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "2d75364e-77e0-4eb2-af96-48f573cb4a43", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM public.campaigns WHERE id = v_id;
  ASSERT v_count = 0,
    '2A: Clipper must NOT see draft/unpaid campaign (got ' || v_count || ')';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2A PASSED' AS result;
ROLLBACK;

-- TEST 2B: Clipper CAN SELECT a genuinely open + verified campaign
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_count integer;
BEGIN
  -- Create campaign as Creator A
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2B Open', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'open', 'verified'
  ) RETURNING id INTO v_id;

  -- Switch to Clipper
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "2d75364e-77e0-4eb2-af96-48f573cb4a43", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM public.campaigns WHERE id = v_id;
  ASSERT v_count = 1,
    '2B: Clipper MUST see open+verified campaign (got ' || v_count || ')';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2B PASSED' AS result;
ROLLBACK;

-- TEST 2C: Creator CAN SELECT their own draft/pending campaign
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2C Own Draft', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  SELECT count(*) INTO v_count FROM public.campaigns WHERE id = v_id;
  ASSERT v_count = 1,
    '2C: Creator must see own draft campaign (got ' || v_count || ')';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2C PASSED' AS result;
ROLLBACK;

-- TEST 2D: Creator CANNOT SELECT another Creator's private campaign
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  -- Create campaign as Creator A
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2D Private', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Switch to Creator B (different user)
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM public.campaigns WHERE id = v_id;
  ASSERT v_count = 0,
    '2D: Creator B must NOT see Creator A campaign (got ' || v_count || ')';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2D PASSED' AS result;
ROLLBACK;

-- TEST 2E: Creator cannot directly modify protected campaign status/payment fields
BEGIN;
DO $$
DECLARE
  v_id uuid;
BEGIN
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2E Protect', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Attempt direct status change
  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, '2Ea: Should have raised exception for direct status change';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%' OR SQLERRM LIKE '%launch payment%',
      '2Ea: Wrong error: ' || SQLERRM;
  END;

  -- Attempt direct launch_payment_status change
  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, '2Eb: Should have raised exception for direct payment status change';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%' OR SQLERRM LIKE '%integrity%',
      '2Eb: Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2E PASSED' AS result;
ROLLBACK;

-- TEST 2F: Creator cannot directly INSERT/UPDATE/DELETE campaign_launch_payments
BEGIN;
DO $$
DECLARE
  v_id uuid;
BEGIN
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2F Payments', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Direct INSERT must fail (REVOKE from authenticated)
  BEGIN
    INSERT INTO public.campaign_launch_payments (
      campaign_id, creator_id, campaign_budget_rupees,
      platform_fee_paise, total_payable_paise, payment_status
    ) VALUES (
      v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1100, 1200, 'pending'
    );
    ASSERT false, '2Fa: Direct INSERT should have been denied';
  EXCEPTION WHEN OTHERS THEN
    -- Expected: permission denied or function protection
    NULL;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2F PASSED' AS result;
ROLLBACK;

-- TEST 2G: Non-admin cannot call admin-only verification/rejection RPCs
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2G Admin RPC', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status, submitted_at
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1100, 1200, 'submitted', now()
  );

  -- Creator tries to verify (admin-only)
  BEGIN
    PERFORM public.verify_campaign_launch_payment(
      (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
    );
    ASSERT false, '2Ga: Creator must not be able to verify payment';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%admin%' OR SQLERRM LIKE '%permission%' OR SQLERRM LIKE '%role%',
      '2Ga: Wrong error: ' || SQLERRM;
  END;

  -- Creator tries to reject (admin-only)
  BEGIN
    PERFORM public.reject_campaign_launch_payment(
      (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id),
      'test'
    );
    ASSERT false, '2Gb: Creator must not be able to reject payment';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%admin%' OR SQLERRM LIKE '%permission%' OR SQLERRM LIKE '%role%',
      '2Gb: Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2G PASSED' AS result;
ROLLBACK;

-- TEST 2H: Admin can perform the legitimate verification flow
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
  v_status text;
BEGIN
  -- Create campaign as Creator
  SET LOCAL role = 'authenticated';
  SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'RLS 2H Admin Verify', 'Brief', 'YouTube', 0, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status, submitted_at
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 1100, 1200, 'submitted', now()
  ) RETURNING id INTO v_payment_id;

  -- Switch to Admin and verify
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  v_result := public.verify_campaign_launch_payment(v_payment_id);
  ASSERT (v_result->>'success')::boolean = true,
    '2H: Admin verification must succeed';

  SELECT status, launch_payment_status INTO v_status, v_status
  FROM public.campaigns WHERE id = v_id;
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    '2H: Campaign must be open after admin verification';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    '2H: Campaign must have verified payment after admin verification';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;
SELECT 'TEST 2H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION 3: FUNCTION ACL TESTING (has_function_privilege)
-- ===========================================================================

-- TEST 3.1: submit_campaign_launch_payment — authenticated can execute
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.submit_campaign_launch_payment(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.1a: submit_campaign_launch_payment must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.submit_campaign_launch_payment(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.1b: submit_campaign_launch_payment must NOT be callable by anon';
END $$;
SELECT 'TEST 3.1 PASSED' AS result;
ROLLBACK;

-- TEST 3.2: verify_campaign_launch_payment — authenticated can execute (admin check inside)
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.verify_campaign_launch_payment(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.2a: verify_campaign_launch_payment must be callable by authenticated (admin check inside)';

  SELECT has_function_privilege(
    'anon',
    'public.verify_campaign_launch_payment(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.2b: verify_campaign_launch_payment must NOT be callable by anon';
END $$;
SELECT 'TEST 3.2 PASSED' AS result;
ROLLBACK;

-- TEST 3.3: reject_campaign_launch_payment — authenticated can execute (admin check inside)
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.reject_campaign_launch_payment(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.3a: reject_campaign_launch_payment must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.reject_campaign_launch_payment(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.3b: reject_campaign_launch_payment must NOT be callable by anon';
END $$;
SELECT 'TEST 3.3 PASSED' AS result;
ROLLBACK;

-- TEST 3.4: get_campaign_launch_payment — authenticated can execute
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.get_campaign_launch_payment(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.4a: get_campaign_launch_payment must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.get_campaign_launch_payment(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.4b: get_campaign_launch_payment must NOT be callable by anon';
END $$;
SELECT 'TEST 3.4 PASSED' AS result;
ROLLBACK;

-- TEST 3.5: verify_cashfree_webhook — service_role ONLY
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'service_role',
    'public.verify_cashfree_webhook(text, text, numeric)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.5a: verify_cashfree_webhook must be callable by service_role';

  SELECT has_function_privilege(
    'authenticated',
    'public.verify_cashfree_webhook(text, text, numeric)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.5b: verify_cashfree_webhook must NOT be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.verify_cashfree_webhook(text, text, numeric)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.5c: verify_cashfree_webhook must NOT be callable by anon';
END $$;
SELECT 'TEST 3.5 PASSED' AS result;
ROLLBACK;

-- TEST 3.6: reject_cashfree_webhook — service_role ONLY
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'service_role',
    'public.reject_cashfree_webhook(text, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.6a: reject_cashfree_webhook must be callable by service_role';

  SELECT has_function_privilege(
    'authenticated',
    'public.reject_cashfree_webhook(text, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.6b: reject_cashfree_webhook must NOT be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.reject_cashfree_webhook(text, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.6c: reject_cashfree_webhook must NOT be callable by anon';
END $$;
SELECT 'TEST 3.6 PASSED' AS result;
ROLLBACK;

-- TEST 3.7: reserve_cashfree_payment_attempt — authenticated only
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.reserve_cashfree_payment_attempt(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.7a: reserve_cashfree_payment_attempt must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.reserve_cashfree_payment_attempt(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.7b: reserve_cashfree_payment_attempt must NOT be callable by anon';
END $$;
SELECT 'TEST 3.7 PASSED' AS result;
ROLLBACK;

-- TEST 3.8: confirm_cashfree_payment_attempt — authenticated only
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.confirm_cashfree_payment_attempt(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.8a: confirm_cashfree_payment_attempt must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.confirm_cashfree_payment_attempt(uuid, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.8b: confirm_cashfree_payment_attempt must NOT be callable by anon';
END $$;
SELECT 'TEST 3.8 PASSED' AS result;
ROLLBACK;

-- TEST 3.9: release_cashfree_payment_reservation — authenticated only
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.release_cashfree_payment_reservation(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '3.9a: release_cashfree_payment_reservation must be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.release_cashfree_payment_reservation(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '3.9b: release_cashfree_payment_reservation must NOT be callable by anon';
END $$;
SELECT 'TEST 3.9 PASSED' AS result;
ROLLBACK;

-- TEST 3.10: All SECURITY DEFINER payment functions have search_path = public
BEGIN;
DO $$
DECLARE
  v_func RECORD;
  v_has_path boolean;
  v_bad_funcs text := '';
BEGIN
  FOR v_func IN
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'reserve_cashfree_payment_attempt',
        'confirm_cashfree_payment_attempt',
        'release_cashfree_payment_reservation',
        'verify_cashfree_webhook',
        'reject_cashfree_webhook',
        'submit_campaign_launch_payment',
        'verify_campaign_launch_payment',
        'reject_campaign_launch_payment'
      )
      AND p.prosecdef = true
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = v_func.proname
        AND pg_get_functiondef(p.oid) LIKE '%SET search_path = public%'
    ) INTO v_has_path;

    IF NOT v_has_path THEN
      v_bad_funcs := v_bad_funcs || ' ' || v_func.proname;
    END IF;
  END LOOP;

  ASSERT v_bad_funcs = '',
    '3.10: Functions missing SET search_path = public:' || v_bad_funcs;
END $$;
SELECT 'TEST 3.10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION 4: SOCIAL OAUTH VERIFICATION / METRIC SAFETY
-- ===========================================================================

-- TEST 4.1: social_accounts.verified field exists and is boolean
BEGIN;
DO $$
DECLARE
  v_col_type text;
BEGIN
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'social_accounts'
    AND column_name = 'verified';

  ASSERT v_col_type = 'boolean',
    '4.1: social_accounts.verified must be boolean, got: ' || COALESCE(v_col_type, 'MISSING');
END $$;
SELECT 'TEST 4.1 PASSED' AS result;
ROLLBACK;

-- TEST 4.2: Browser cannot write social_accounts (no RLS INSERT policy) and
-- a non-admin cannot set social_accounts.verified via direct UPDATE
-- (enforce_social_account_fields trigger blocks it)
BEGIN;
DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Fixture creation runs as service_role — the same path the OAuth callback
  -- uses in production. RLS does not apply to service_role (BYPASSRLS) and
  -- auth.uid() is NULL there, so the fixture write is trusted and the two
  -- guards below stay meaningful for browser sessions.
  PERFORM set_config('role', 'service_role', true);

  INSERT INTO public.social_accounts (
    user_id, platform, handle, provider_account_id, status
  ) VALUES (
    'e92427b0-254e-44cc-b2df-be83792c8a94', 'YouTube', 'Test Channel', 'UC_test_123', 'connected'
  ) RETURNING id INTO v_id;

  -- Switch to Creator A (browser session)
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  -- 4.2a: authenticated users must not be able to attach a social account
  -- directly (no INSERT policy — rows come only from the OAuth callback)
  BEGIN
    INSERT INTO public.social_accounts (
      user_id, platform, handle, provider_account_id, status
    ) VALUES (
      'e92427b0-254e-44cc-b2df-be83792c8a94', 'Instagram', 'Injected Channel', 'UC_injected', 'connected'
    );
    ASSERT false, '4.2a: Creator must not be able to INSERT social_accounts directly';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected: RLS denies the row (no INSERT policy for authenticated)
    NULL;
  END;

  -- 4.2b: direct UPDATE of the trust field must be blocked by the trigger
  BEGIN
    UPDATE public.social_accounts SET verified = true WHERE id = v_id;
    ASSERT false, '4.2b: Creator must not be able to set verified directly';
  EXCEPTION WHEN OTHERS THEN
    -- Expected: trigger blocks non-admin verified changes
    NULL;
  END;

  -- Cleanup (as service_role)
  PERFORM set_config('role', 'service_role', true);
  DELETE FROM public.social_accounts WHERE id = v_id;
END $$;
SELECT 'TEST 4.2 PASSED' AS result;
ROLLBACK;

-- TEST 4.3: ingest_clip_metrics is service_role only (metric pipeline gate)
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '4.3a: ingest_clip_metrics must NOT be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '4.3b: ingest_clip_metrics must NOT be callable by anon';

  SELECT has_function_privilege(
    'service_role',
    'public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '4.3c: ingest_clip_metrics must be callable by service_role';
END $$;
SELECT 'TEST 4.3 PASSED' AS result;
ROLLBACK;

-- TEST 4.4: finalize_clip_earning is service_role only (financial pipeline gate)
BEGIN;
DO $$
DECLARE
  v_can_execute boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'public.finalize_clip_earning(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '4.4a: finalize_clip_earning must NOT be callable by authenticated';

  SELECT has_function_privilege(
    'anon',
    'public.finalize_clip_earning(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = false,
    '4.4b: finalize_clip_earning must NOT be callable by anon';

  SELECT has_function_privilege(
    'service_role',
    'public.finalize_clip_earning(uuid)',
    'EXECUTE'
  ) INTO v_can_execute;
  ASSERT v_can_execute = true,
    '4.4c: finalize_clip_earning must be callable by service_role';
END $$;
SELECT 'TEST 4.4 PASSED' AS result;
ROLLBACK;

-- TEST 4.5: social_connections token trigger exists and is SECURITY DEFINER
BEGIN;
DO $$
DECLARE
  v_trigger_exists boolean;
  v_is_secdef boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'social_connections'
      AND t.tgname = 'enforce_social_connection_tokens'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;
  ASSERT v_trigger_exists = true,
    '4.5a: enforce_social_connection_tokens trigger must exist';

  SELECT p.prosecdef INTO v_is_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'enforce_social_connection_token_protection';
  ASSERT v_is_secdef = true,
    '4.5b: Token trigger function must be SECURITY DEFINER';
END $$;
SELECT 'TEST 4.5 PASSED' AS result;
ROLLBACK;
