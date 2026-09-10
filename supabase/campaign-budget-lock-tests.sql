-- ===========================================================================
-- CAMPAIGN BUDGET LOCK TESTS — Phase 3
-- ===========================================================================
-- Run in Supabase SQL Editor to verify budget lock security.
--
-- NOTE: These tests use direct INSERT to create campaigns, bypassing the
-- create_campaign() RPC which has an overloaded signature issue in some
-- databases. The trigger fires on UPDATE regardless of how the row was
-- created, so this is equivalent for testing the budget lock.
--
-- How to use:
--   1. Create test users in Supabase Dashboard > Auth > Users:
--      - A creator user (note UUID as CREATOR_UUID)
--      - An admin user (note UUID as ADMIN_UUID)
--   2. Ensure creator has role='creator' and status='active' in profiles
--   3. Ensure admin has role='admin' in profiles
--   4. Replace placeholder UUIDs below
--   5. Run each test individually and verify the expected outcome
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- Replace with real UUIDs:
-- \set creator_uuid '00000000-0000-0000-0000-000000000001'
-- \set admin_uuid   '00000000-0000-0000-0000-000000000002'

-- Helper: create a test campaign via direct INSERT (avoids overloaded RPC)
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
-- Expected: Creator adjusts budget from ₹400 to ₹500 — SUCCEEDS
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 1', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 2', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-002');

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
-- TEST 3: Budget change after verification is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is verified"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 3', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-003');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 4', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 5', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-005');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Admin verifies
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Switch to admin
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 5';

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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 6', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-006');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Need to change budget');
END $$;

-- Creator adjusts budget after rejection
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 6';

  PERFORM public.adjust_campaign_budget(v_id, 600, 'Post-rejection adjustment');

  ASSERT (SELECT budget FROM public.campaigns WHERE id = v_id) = 600,
    'Budget should be 600 after post-rejection adjustment';
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Payment amount always matches campaign budget at submission
-- ===========================================================================
-- Expected: Payment record shows ₹400 (budget at time of submission)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 7', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-007');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  ASSERT (SELECT campaign_budget_rupees FROM public.campaign_launch_payments WHERE id = v_payment_id) = 400,
    'Payment budget snapshot should be 400';
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Non-budget field changes are NOT blocked by budget lock
-- ===========================================================================
-- Expected: Changing title after submission SUCCEEDS
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 8', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-008');

  -- Change title — should NOT be blocked
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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 9', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 10', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-010');
END $$;

-- Try direct SQL UPDATE (bypassing RPCs) — should be BLOCKED by trigger
BEGIN
  UPDATE public.campaigns SET budget = 9999
  WHERE title = 'Budget Lock Test 10';
  ASSERT false, 'Should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Cannot change campaign budget%',
    'Wrong error: ' || SQLERRM;
END;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: Resubmission after rejection — budget is re-locked
-- ===========================================================================
-- Expected: After resubmission, budget change is blocked again
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 11', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  -- Submit
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-A');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Admin rejects
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Changing budget');

  -- Creator adjusts budget
  PERFORM public.adjust_campaign_budget(v_id, 600, 'Increased budget');

  -- Resubmit at new budget
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-B');

  -- Now budget change should be BLOCKED again
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
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  v_id := public._test_create_campaign('Budget Lock Test 12', 400, 'REPLACE_WITH_CREATOR_UUID'::uuid);

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-012');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_id;

  -- Admin verifies (sets status='open')
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Creator pauses campaign — should work
  PERFORM public.campaign_action(v_id, 'pause', null, null);

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'Status should be paused';
END $$;

SELECT 'TEST 12 PASSED' AS result;
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
-- TEST  3: Budget change after VERIFICATION -> BLOCKED
-- TEST  4: update_campaign() budget after submission -> BLOCKED
-- TEST  5: Admin budget change after verification -> BLOCKED
-- TEST  6: Budget change after REJECTION -> ALLOWED
-- TEST  7: Payment amount matches budget at submission
-- TEST  8: Non-budget field changes NOT blocked
-- TEST  9: Client-supplied budget in patch -> BLOCKED
-- TEST 10: Direct SQL UPDATE on budget -> BLOCKED
-- TEST 11: Resubmission re-locks budget
-- TEST 12: Status transitions NOT affected by budget lock
