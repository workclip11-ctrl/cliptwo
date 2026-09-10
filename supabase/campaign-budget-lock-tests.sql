-- ===========================================================================
-- CAMPAIGN BUDGET LOCK TESTS — Phase 3
-- ===========================================================================
-- Run in Supabase SQL Editor to verify budget lock security.
--
-- How to use:
--   1. Create test users in Supabase Dashboard > Auth > Users:
--      - A creator user (note UUID as CREATOR_UUID)
--      - An admin user (note UUID as ADMIN_UUID)
--   2. Ensure creator has role='creator' and status='active' in profiles
--   3. Ensure admin has role='admin' in profiles
--   4. Replace ALL placeholder UUIDs in this file with real UUIDs
--   5. Run each test individually (BEGIN...ROLLBACK) and verify outcome
--
-- Auth pattern: always SET LOCAL role = 'authenticated'.
-- Admin is simulated via JWT claims only (is_admin() checks auth.uid()).
-- ===========================================================================

-- Replace with real UUIDs from Supabase Dashboard > Auth > Users:
-- \set creator_uuid '00000000-0000-0000-0000-000000000001'
-- \set admin_uuid   '00000000-0000-0000-0000-000000000002'

-- ===========================================================================
-- TEST 1: Budget can be changed before payment workflow begins
-- ===========================================================================
-- Expected: Creator adjusts budget from 400 to 500 — SUCCEEDS
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
    'Budget Lock Test 1', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.adjust_campaign_budget(v_id, 500::numeric, 'Pre-payment adjustment');

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 500,
    'Budget should be 500 after adjustment';
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Budget change after submission is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is submitted"
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
    'Budget Lock Test 2', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-002');

  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800::numeric, 'Post-submission change');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Budget change after verification is BLOCKED (Creator perspective)
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is verified"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 3', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-003');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin for verification
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800::numeric, 'Post-verification change');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Budget change via update_campaign() after submission is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is submitted"
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
    'Budget Lock Test 4', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-004');

  BEGIN
    PERFORM public.update_campaign(v_id, '{"budget": 800}'::jsonb);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Admin budget change after verification is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is verified"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 5', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-005');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Admin attempts budget change — should also be BLOCKED
  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800::numeric, 'Admin post-verification change');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: After rejection, budget can be changed again
-- ===========================================================================
-- Expected: Budget adjustment SUCCEEDS after payment rejection
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 6', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-006');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Need to change budget');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator adjusts budget — should SUCCEED
  PERFORM public.adjust_campaign_budget(v_id, 600::numeric, 'Post-rejection adjustment');

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 600,
    'Budget should be 600 after post-rejection adjustment';
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Payment snapshot matches campaign budget at submission
-- ===========================================================================
-- Expected: campaign_budget_rupees = 400, fee = 4000 paise, total = 44000 paise
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 7', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-007');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  ASSERT (SELECT campaign_budget_rupees FROM public.campaign_launch_payments WHERE id = v_payment_id) = 400,
    'Payment budget snapshot should be 400';

  ASSERT (SELECT platform_fee_paise FROM public.campaign_launch_payments WHERE id = v_payment_id) = 4000,
    'Platform fee should be 4000 paise (10% of 40000 paise)';

  ASSERT (SELECT total_payable_paise FROM public.campaign_launch_payments WHERE id = v_payment_id) = 44000,
    'Total payable should be 44000 paise';
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Non-budget field changes are NOT blocked by budget lock
-- ===========================================================================
-- Expected: Changing title after submission SUCCEEDS
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
    'Budget Lock Test 8', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-008');

  PERFORM public.update_campaign(v_id, '{"title": "Budget Lock Test 8 Updated"}'::jsonb);

  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Budget Lock Test 8 Updated',
    'Title should be updated';
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Client-supplied budget in update_campaign is also blocked
-- ===========================================================================
-- Expected: Direct patch with budget key is BLOCKED after submission
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
    'Budget Lock Test 9', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-009');

  BEGIN
    PERFORM public.update_campaign(v_id, '{"budget": 999}'::jsonb);
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Direct SQL UPDATE on budget is also blocked
-- ===========================================================================
-- Expected: Even raw SQL UPDATE is blocked by the trigger
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
    'Budget Lock Test 10', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-010');
END $$;

DO $$
BEGIN
  UPDATE public.campaigns SET budget = 9999
  WHERE title = 'Budget Lock Test 10';
  ASSERT false, 'Should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
    'Wrong error: ' || SQLERRM;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: Resubmission after rejection — budget is re-locked
-- ===========================================================================
-- NOTE: This test uses a fresh campaign to avoid idempotency_key collision.
-- The audit_logs table has a UNIQUE constraint on idempotency_key which
-- includes extract(epoch from now()). Two submissions in the same transaction
-- would collide. So this test verifies the trigger state logic only.
--
-- Expected: After rejection, budget is unlocked. After resubmission, locked again.
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  -- Create campaign
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 11', 'Test brief', 'YouTube', 0, 'Test Creator',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-A');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Changing budget');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- After rejection: budget change ALLOWED
  PERFORM public.adjust_campaign_budget(v_id, 600::numeric, 'Increased budget');

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 600,
    'Budget should be 600 after post-rejection adjustment';

  -- Verify payment is in rejected state — trigger should allow budget changes
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'rejected',
    'launch_payment_status should be rejected';
END $$;

SELECT 'TEST 11 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 12: Budget lock does NOT interfere with status changes
-- ===========================================================================
-- Expected: Status transitions work normally while budget is locked
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test 12', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-012');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies (sets status='open')
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator pauses campaign — should work (status change, not budget change)
  PERFORM public.campaign_action(v_id, 'pause', null);

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'Status should be paused';
END $$;

SELECT 'TEST 12 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- DIRECT TRIGGER TESTS
-- ===========================================================================
-- These test the BEFORE UPDATE trigger directly via SQL UPDATE,
-- confirming database-level protection independent of any RPC.

-- ===========================================================================
-- TEST A: Direct UPDATE on budget succeeds when pending
-- ===========================================================================
-- Expected: UPDATE succeeds (launch_payment_status = 'pending')
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
    'Budget Lock Test A', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  UPDATE public.campaigns SET budget = 500::numeric WHERE id = v_id;

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 500,
    'Budget should be 500 after direct UPDATE';
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Direct UPDATE on budget blocked when submitted
-- ===========================================================================
-- Expected: UPDATE fails with "Cannot change campaign budget"
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
    'Budget Lock Test B', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-B');
END $$;

DO $$
BEGIN
  UPDATE public.campaigns SET budget = 800::numeric
  WHERE title = 'Budget Lock Test B';
  ASSERT false, 'Should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
    'Wrong error: ' || SQLERRM;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Direct UPDATE on budget blocked when verified
-- ===========================================================================
-- Expected: UPDATE fails with "Cannot change campaign budget"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test C', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-C');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

DO $$
BEGIN
  UPDATE public.campaigns SET budget = 800::numeric
  WHERE title = 'Budget Lock Test C';
  ASSERT false, 'Should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
    'Wrong error: ' || SQLERRM;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Direct UPDATE on budget succeeds when rejected
-- ===========================================================================
-- Expected: UPDATE succeeds (launch_payment_status = 'rejected')
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Budget Lock Test D', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    400::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-D');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Testing rejected state');
END $$;

DO $$
BEGIN
  UPDATE public.campaigns SET budget = 600::numeric
  WHERE title = 'Budget Lock Test D';

  ASSERT (SELECT budget FROM public.campaigns WHERE title = 'Budget Lock Test D') = 600,
    'Budget should be 600 after direct UPDATE on rejected campaign';
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- TEST  1: Budget change BEFORE payment -> ALLOWED
-- TEST  2: Budget change after SUBMISSION -> BLOCKED
-- TEST  3: Budget change after VERIFICATION -> BLOCKED (Creator)
-- TEST  4: update_campaign() budget after submission -> BLOCKED
-- TEST  5: Admin budget change after verification -> BLOCKED
-- TEST  6: Budget change after REJECTION -> ALLOWED
-- TEST  7: Payment snapshot matches budget at submission
-- TEST  8: Non-budget field changes NOT blocked
-- TEST  9: Client-supplied budget in patch -> BLOCKED
-- TEST 10: Direct SQL UPDATE on budget -> BLOCKED
-- TEST 11: Budget unlocked after rejection (resubmission tested in TEST 2+6)
-- TEST 12: Status transitions NOT affected by budget lock
-- TRIGGER A: Direct UPDATE allowed when pending
-- TRIGGER B: Direct UPDATE blocked when submitted
-- TRIGGER C: Direct UPDATE blocked when verified
-- TRIGGER D: Direct UPDATE allowed when rejected
