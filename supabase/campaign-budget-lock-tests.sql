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

-- Helper: create a test campaign via direct INSERT
-- Bypasses the overloaded create_campaign() RPC.
-- Sets status='draft' and launch_payment_status='pending' matching create_campaign behavior.
CREATE OR REPLACE FUNCTION public._test_create_campaign(
  p_title text,
  p_budget numeric,
  p_created_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    p_title, 'Test brief', 'YouTube', 0, 'Test Creator', p_created_by,
    p_budget, 'draft', 'pending'
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
  v_id := public._test_create_campaign('Budget Lock Test 1', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.adjust_campaign_budget(v_id, 500, 'Pre-payment adjustment');

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
  v_id := public._test_create_campaign('Budget Lock Test 2', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-002');

  -- Creator attempts budget change — should be BLOCKED by trigger
  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800, 'Post-submission change');
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
  v_id := public._test_create_campaign('Budget Lock Test 3', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-003');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin for verification
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies payment
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator attempts budget change — should be BLOCKED
  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800, 'Post-verification change');
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
  v_id := public._test_create_campaign('Budget Lock Test 4', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-004');

  -- Creator attempts budget change via update_campaign — should be BLOCKED
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
  v_id := public._test_create_campaign('Budget Lock Test 5', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-005');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies payment
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Admin attempts budget change — should also be BLOCKED
  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 800, 'Admin post-verification change');
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
  v_id := public._test_create_campaign('Budget Lock Test 6', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-006');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects payment
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Need to change budget');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator adjusts budget — should SUCCEED
  PERFORM public.adjust_campaign_budget(v_id, 600, 'Post-rejection adjustment');

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 600,
    'Budget should be 600 after post-rejection adjustment';
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Payment snapshot matches campaign budget at submission
-- ===========================================================================
-- Expected: campaign_budget_rupees = 400 (budget at time of submission)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 7', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-007');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Verify snapshot
  ASSERT (SELECT campaign_budget_rupees FROM public.campaign_launch_payments WHERE id = v_payment_id) = 400,
    'Payment budget snapshot should be 400';

  -- Verify fee calculation: 10% of 400 rupees = 4000 paise fee
  ASSERT (SELECT platform_fee_paise FROM public.campaign_launch_payments WHERE id = v_payment_id) = 4000,
    'Platform fee should be 4000 paise (10% of 40000 paise)';

  -- Verify total: 40000 + 4000 = 44000 paise
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
  v_id := public._test_create_campaign('Budget Lock Test 8', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-008');

  -- Change title — should NOT be blocked by budget lock trigger
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
  v_id := public._test_create_campaign('Budget Lock Test 9', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-009');

  -- Smuggle budget via update_campaign patch — should be BLOCKED
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
  v_id := public._test_create_campaign('Budget Lock Test 10', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-010');
END $$;

-- Direct SQL UPDATE (bypassing RPCs) — should be BLOCKED by trigger
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
-- Expected: After resubmission, budget change is blocked again
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 11', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-A');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Changing budget');

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator adjusts budget (allowed after rejection)
  PERFORM public.adjust_campaign_budget(v_id, 600, 'Increased budget');

  -- Creator resubmits at new budget
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-B');

  -- Budget change should now be BLOCKED again
  BEGIN
    PERFORM public.adjust_campaign_budget(v_id, 700, 'Second change attempt');
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
      'Wrong error: ' || SQLERRM;
  END;
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
  v_id := public._test_create_campaign('Budget Lock Test 12', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
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
  v_id := public._test_create_campaign('Budget Lock Test A', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Direct UPDATE — should succeed (status = pending)
  UPDATE public.campaigns SET budget = 500 WHERE id = v_id;

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
  v_id := public._test_create_campaign('Budget Lock Test B', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-B');
END $$;

-- Direct UPDATE — should be BLOCKED by trigger
DO $$
BEGIN
  UPDATE public.campaigns SET budget = 800
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
  v_id := public._test_create_campaign('Budget Lock Test C', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-C');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin verifies
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Direct UPDATE — should be BLOCKED by trigger
DO $$
BEGIN
  UPDATE public.campaigns SET budget = 800
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
  v_id := public._test_create_campaign('Budget Lock Test D', 400::numeric, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-TRIGGER-D');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Testing rejected state');
END $$;

-- Direct UPDATE — should SUCCEED (status = rejected)
DO $$
BEGIN
  UPDATE public.campaigns SET budget = 600
  WHERE title = 'Budget Lock Test D';

  ASSERT (SELECT budget FROM public.campaigns WHERE title = 'Budget Lock Test D') = 600,
    'Budget should be 600 after direct UPDATE on rejected campaign';
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- Cleanup helper function
-- ===========================================================================
DROP FUNCTION IF EXISTS public._test_create_campaign(text, numeric, uuid);

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
-- TEST 11: Resubmission re-locks budget
-- TEST 12: Status transitions NOT affected by budget lock
-- TRIGGER A: Direct UPDATE allowed when pending
-- TRIGGER B: Direct UPDATE blocked when submitted
-- TRIGGER C: Direct UPDATE blocked when verified
-- TRIGGER D: Direct UPDATE allowed when rejected
