-- ===========================================================================
-- CASHFREE WEBHOOK VERIFICATION — SECURITY REGRESSION TESTS
-- ===========================================================================
-- Tests for the secure Cashfree webhook verification trigger fix.
--
-- Authorization mechanism: temporary table _cf_verify_signal created by
-- verify_cashfree_webhook (SECURITY DEFINER, service_role only) in the
-- same transaction. Trigger checks for its existence.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper: 2d75364e-77e0-4eb2-af96-48f573cb4a43
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- TEST 1: Creator cannot set launch_payment_status = 'verified' directly
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Test 1', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Authenticated user cannot forge _cf_verify_signal temp table
-- ===========================================================================
-- Even if an attacker knows the temp table name, they cannot create it
-- because PostgREST connections lack CREATE privilege on pg_temp.
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Test 2', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Try to create the temp table (should fail for authenticated role)
  BEGIN
    EXECUTE 'CREATE TEMPORARY TABLE IF NOT EXISTS _cf_verify_signal (id int)';
    -- If we reach here, the temp table was created. Now try the update.
    -- This should STILL fail because the trigger checks pg_temp schema,
    -- and the authenticated role's pg_temp is different from the function's.
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, 'Should have raised exception even with temp table';
  EXCEPTION WHEN OTHERS THEN
    -- Expected: either CREATE fails or UPDATE is blocked
    RAISE NOTICE 'Test 2: Got expected error: %', SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Anon cannot forge _cf_verify_signal temp table
-- ===========================================================================
BEGIN;
SET LOCAL role = 'anon';

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Test 3', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    EXECUTE 'CREATE TEMPORARY TABLE IF NOT EXISTS _cf_verify_signal (id int)';
    UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Test 3: Got expected error: %', SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Direct campaign UPDATE remains blocked (no temp table context)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Test 4', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns
    SET status = 'open', launch_payment_status = 'verified'
    WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can verify%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: verify_cashfree_webhook() transitions a valid submitted payment
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000005';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-000000000005_attempt_1';
  v_payment_id text := '1454762304210684928';
  v_result jsonb;
BEGIN
  -- Create campaign
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 5', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  -- Create payment record
  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  -- Switch to service_role for webhook call
  PERFORM set_config('role', 'service_role', true);

  -- Call verify_cashfree_webhook
  v_result := public.verify_cashfree_webhook(v_order_id, v_payment_id, 110.00);

  ASSERT (v_result->>'success')::boolean = true, 'RPC should succeed';
  ASSERT (v_result->>'payment_status') = 'verified', 'Payment should be verified';

  -- Verify campaign state
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Campaign launch_payment_status should be verified';

  -- Verify payment state
  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE cashfree_order_id = v_order_id) = 'verified',
    'Payment should be verified';
  ASSERT (SELECT cashfree_cf_payment_id FROM public.campaign_launch_payments WHERE cashfree_order_id = v_order_id) = v_payment_id,
    'cf_payment_id should be set';

  -- Cleanup
  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Wrong amount is rejected
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000006';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-000000000006_attempt_1';
  v_payment_id text := '1454762304210684929';
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 6', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  PERFORM set_config('role', 'service_role', true);

  -- Wrong amount (99 instead of 110)
  v_result := public.verify_cashfree_webhook(v_order_id, v_payment_id, 99.00);

  ASSERT (v_result->>'success')::boolean = false, 'RPC should fail on amount mismatch';
  ASSERT (v_result->>'error') = 'Amount mismatch', 'Error should be amount mismatch';

  -- Verify campaign was rejected
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'rejected',
    'Campaign should be rejected on amount mismatch';

  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Wrong payment ID is rejected (amount mismatch scenario)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000007';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-000000000007_attempt_1';
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 7', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  PERFORM set_config('role', 'service_role', true);

  -- Wrong amount (50 instead of 110) — simulates wrong payment
  v_result := public.verify_cashfree_webhook(v_order_id, 'wrong_payment_id', 50.00);

  ASSERT (v_result->>'success')::boolean = false, 'RPC should fail';

  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Already verified payment is idempotent
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000008';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-000000000008_attempt_1';
  v_payment_id text := '1454762304210684930';
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 8', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  PERFORM set_config('role', 'service_role', true);

  -- First verification
  v_result := public.verify_cashfree_webhook(v_order_id, v_payment_id, 110.00);
  ASSERT (v_result->>'success')::boolean = true, 'First verification should succeed';

  -- Second verification (idempotent)
  v_result := public.verify_cashfree_webhook(v_order_id, v_payment_id, 110.00);
  ASSERT (v_result->>'success')::boolean = true, 'Second verification should succeed';
  ASSERT (v_result->>'idempotent')::boolean = true, 'Should be idempotent';

  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Campaign becomes open only through verified payment
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000009';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-000000000009_attempt_1';
  v_payment_id text := '1454762304210684931';
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 9', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  -- Before verification, campaign should be draft
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'draft',
    'Campaign should be draft before verification';

  PERFORM set_config('role', 'service_role', true);

  v_result := public.verify_cashfree_webhook(v_order_id, v_payment_id, 110.00);

  -- After verification, campaign should be open
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open after verification';

  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Audit actor_id remains NULL for system verification
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-00000000000a';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-00000000000a_attempt_1';
  v_payment_id text := '1454762304210684932';
  v_audit record;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 10', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'submitted',
    v_order_id, 1, now()
  );

  PERFORM set_config('role', 'service_role', true);

  PERFORM public.verify_cashfree_webhook(v_order_id, v_payment_id, 110.00);

  -- Check audit log
  SELECT action, actor, actor_id INTO v_audit
  FROM public.audit_logs
  WHERE entity_id = v_campaign_id::text
    AND idempotency_key = 'webhook_verify_' || v_order_id;

  ASSERT v_audit.action = 'campaign_payment_verified_cashfree',
    'Audit action should be campaign_payment_verified_cashfree';
  ASSERT v_audit.actor = 'system',
    'Audit actor should be system';
  ASSERT v_audit.actor_id IS NULL,
    'Audit actor_id should be NULL for automated verification';

  DELETE FROM public.audit_logs WHERE entity_id = v_campaign_id::text;
  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: verify_cashfree_webhook is service_role only
-- ===========================================================================
BEGIN;
DO $$
BEGIN
  -- Should NOT be executable by authenticated
  ASSERT NOT has_function_privilege('authenticated', 'public.verify_cashfree_webhook(text,text,numeric)', 'EXECUTE'),
    'Authenticated should NOT have EXECUTE on verify_cashfree_webhook';

  -- Should NOT be executable by anon
  ASSERT NOT has_function_privilege('anon', 'public.verify_cashfree_webhook(text,text,numeric)', 'EXECUTE'),
    'Anon should NOT have EXECUTE on verify_cashfree_webhook';

  -- Should NOT be executable by public
  ASSERT NOT has_function_privilege('public', 'public.verify_cashfree_webhook(text,text,numeric)', 'EXECUTE'),
    'Public should NOT have EXECUTE on verify_cashfree_webhook';

  -- Should be executable by service_role
  ASSERT has_function_privilege('service_role', 'public.verify_cashfree_webhook(text,text,numeric)', 'EXECUTE'),
    'service_role should have EXECUTE on verify_cashfree_webhook';
END $$;

SELECT 'TEST 11 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 12: Payment not in submitted status is rejected
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-00000000000b';
  v_order_id text := 'cliptwo_c0000000-0000-0000-0000-00000000000b_attempt_1';
  v_err text;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    v_campaign_id, 'CF Test 12', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  );

  -- Create payment with 'pending' status (not 'submitted')
  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_attempt_number, submitted_at
  ) VALUES (
    v_campaign_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1000, 11000, 'pending',
    v_order_id, 1, now()
  );

  PERFORM set_config('role', 'service_role', true);

  BEGIN
    PERFORM public.verify_cashfree_webhook(v_order_id, '1454762304210684933', 110.00);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%not in submitted status%',
      'Wrong error: ' || v_err;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST 12 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 13: Non-existent order is rejected
-- ===========================================================================
BEGIN;
SET LOCAL role = 'service_role';

DO $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    PERFORM public.verify_cashfree_webhook('nonexistent_order', '123', 110.00);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Payment record not found%',
      'Wrong error: ' || v_err;
  END;
END $$;

SELECT 'TEST 13 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 14: Trigger allows admin verify_campaign_launch_payment (preserved path)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'c0000000-0000-0000-0000-00000000000e', 'CF Test 14', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status, utr_reference, submitted_at
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 0, 0, 0,
    'submitted', 'UTR-TEST-14', now()
  ) RETURNING id INTO v_payment_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies — should succeed (preserves existing admin path)
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'Campaign should be verified after admin verification';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'Campaign should be open after admin verification';

  DELETE FROM public.campaign_launch_payments WHERE id = v_payment_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 14 PASSED' AS result;
ROLLBACK;
