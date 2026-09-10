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
--   4. Replace placeholder UUIDs below
--   5. Run each test individually and verify the expected outcome
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- Replace with real UUIDs:
-- \set creator_uuid '00000000-0000-0000-0000-000000000001'
-- \set admin_uuid   '00000000-0000-0000-0000-000000000002'

-- ===========================================================================
-- TEST 1: Budget can be changed before payment workflow begins
-- ===========================================================================
-- Expected: Creator adjusts budget from ₹40,000 to ₹50,000 — SUCCEEDS
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 1',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 1' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Adjust budget before any payment — should succeed
  PERFORM public.adjust_campaign_budget(v_id, 500, 'Pre-payment adjustment');
END $$;

-- Verify budget was changed
SELECT budget FROM public.campaigns
WHERE title = 'Budget Lock Test 1' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;
-- Expected: 500
ROLLBACK;

-- ===========================================================================
-- TEST 2: Budget change after submission is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is submitted"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 2',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 2' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-002');

  -- Now try to change budget — should be BLOCKED
  PERFORM public.adjust_campaign_budget(v_id, 800, 'Post-submission change');
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is submitted
ROLLBACK;

-- ===========================================================================
-- TEST 3: Budget change after verification is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is verified"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 3',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 3' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-003');

  -- Get payment ID
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Admin verifies payment
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Now try to change budget — should be BLOCKED
  PERFORM public.adjust_campaign_budget(v_id, 800, 'Post-verification change');
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is verified
ROLLBACK;

-- ===========================================================================
-- TEST 4: Budget change via update_campaign() after submission is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is submitted"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 4',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 4' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-004');

  -- Try via update_campaign (general-purpose RPC) — should also be BLOCKED
  PERFORM public.update_campaign(v_id, '{"budget": 800}'::jsonb);
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is submitted
ROLLBACK;

-- ===========================================================================
-- TEST 5: Admin budget change after verification is BLOCKED
-- ===========================================================================
-- Expected: ERROR "Cannot change campaign budget: launch payment is verified"
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 5',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 5' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-005');

  -- Get payment ID
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;
END $$;

-- Switch to admin
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 5';

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Admin verifies
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Admin tries to change budget — should also be BLOCKED
  PERFORM public.adjust_campaign_budget(v_id, 800, 'Admin post-verification change');
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is verified
ROLLBACK;

-- ===========================================================================
-- TEST 6: After rejection, budget can be changed again
-- ===========================================================================
-- Expected: Budget adjustment SUCCEEDS after payment rejection
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 6',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 6' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-006');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;
END $$;

-- Switch to admin to reject
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 6';

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Reject payment
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Need to change budget');
END $$;

-- Switch back to creator
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 6';

  -- Now budget change should be ALLOWED
  PERFORM public.adjust_campaign_budget(v_id, 600, 'Post-rejection adjustment');
END $$;

-- Verify budget was changed
SELECT budget FROM public.campaigns WHERE title = 'Budget Lock Test 6';
-- Expected: 600
ROLLBACK;

-- ===========================================================================
-- TEST 7: Payment amount always matches campaign budget at verification
-- ===========================================================================
-- Expected: verify checks payment.campaign_budget_rupees == campaign.budget
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 7',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 7' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment at ₹400 budget
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-007');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Verify the payment record matches campaign budget
  -- (payment was submitted when budget was ₹400, so it should show ₹400)
  ASSERT (
    SELECT campaign_budget_rupees FROM public.campaign_launch_payments WHERE id = v_payment_id
  ) = 400,
  'Payment budget snapshot should be 400';
END $$;

ROLLBACK;

-- ===========================================================================
-- TEST 8: Non-budget field changes are NOT blocked by budget lock
-- ===========================================================================
-- Expected: Changing title/description after submission SUCCEEDS
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 8',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 8' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-008');

  -- Change title — should NOT be blocked
  PERFORM public.update_campaign(v_id, '{"title": "Budget Lock Test 8 Updated"}'::jsonb);
END $$;

-- Verify title changed
SELECT title FROM public.campaigns WHERE title LIKE 'Budget Lock Test 8%';
-- Expected: "Budget Lock Test 8 Updated"
ROLLBACK;

-- ===========================================================================
-- TEST 9: Client-supplied budget in update_campaign is also blocked
-- ===========================================================================
-- Expected: Direct patch with budget key is BLOCKED after submission
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 9',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 9' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-009');

  -- Try to smuggle budget via update_campaign patch — should be BLOCKED
  PERFORM public.update_campaign(v_id, '{"budget": 999}'::jsonb);
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is submitted
ROLLBACK;

-- ===========================================================================
-- TEST 10: Direct SQL UPDATE on budget is also blocked
-- ===========================================================================
-- Expected: Even raw SQL UPDATE is blocked by the trigger
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 10',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 10' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-010');
END $$;

-- Try direct SQL UPDATE (bypassing RPCs) — should be BLOCKED by trigger
UPDATE public.campaigns SET budget = 9999
WHERE title = 'Budget Lock Test 10';

-- Expected: ERROR: Cannot change campaign budget: launch payment is submitted
ROLLBACK;

-- ===========================================================================
-- TEST 11: Resubmission after rejection — budget is re-locked
-- ===========================================================================
-- Expected: After resubmission, budget change is blocked again
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 11',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 11' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit → Reject → Adjust budget → Resubmit
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-A');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments
  WHERE campaign_id = v_id;

  -- Reject (switch to admin first — see below)
END $$;

-- Admin rejects
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 11';
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  PERFORM public.reject_campaign_launch_payment(v_payment_id, 'Changing budget');
END $$;

-- Creator adjusts budget and resubmits
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 11';

  -- Budget change allowed after rejection
  PERFORM public.adjust_campaign_budget(v_id, 600, 'Increased budget');

  -- Resubmit at new budget
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-011-B');

  -- Now budget change should be BLOCKED again
  PERFORM public.adjust_campaign_budget(v_id, 700, 'Second change attempt');
END $$;

-- Expected: ERROR: Cannot change campaign budget: launch payment is submitted
ROLLBACK;

-- ===========================================================================
-- TEST 12: Budget lock does NOT interfere with status changes
-- ===========================================================================
-- Expected: Status transitions work normally while budget is locked
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Budget Lock Test 12',
  'Brief',
  'YouTube',
  400,
  'Creator'
);

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns
  WHERE title = 'Budget Lock Test 12' AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Submit payment
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-012');

  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_id;
END $$;

-- Admin verifies and publishes
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 12';
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_id;

  -- Verify payment (sets status='open')
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Creator pauses campaign — should work
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.campaigns WHERE title = 'Budget Lock Test 12';

  PERFORM public.campaign_action(v_id, 'pause', null, null);
END $$;

-- Verify status changed to paused
SELECT status FROM public.campaigns WHERE title = 'Budget Lock Test 12';
-- Expected: paused
ROLLBACK;

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- TEST  1: Budget change BEFORE payment → ALLOWED           ✓
-- TEST  2: Budget change after SUBMISSION → BLOCKED          ✓
-- TEST  3: Budget change after VERIFICATION → BLOCKED        ✓
-- TEST  4: update_campaign() budget after submission → BLOCKED ✓
-- TEST  5: Admin budget change after verification → BLOCKED  ✓
-- TEST  6: Budget change after REJECTION → ALLOWED           ✓
-- TEST  7: Payment amount matches budget at submission        ✓
-- TEST  8: Non-budget field changes NOT blocked              ✓
-- TEST  9: Client-supplied budget in patch → BLOCKED         ✓
-- TEST 10: Direct SQL UPDATE on budget → BLOCKED             ✓
-- TEST 11: Resubmission re-locks budget                      ✓
-- TEST 12: Status transitions NOT affected by budget lock    ✓
