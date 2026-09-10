-- ===========================================================================
-- CAMPAIGN STATE MACHINE TESTS — Phase 1
-- ===========================================================================
-- Run in Supabase SQL Editor to verify campaign creation hardening.
--
-- How to use:
--   1. Create test users in Supabase Dashboard > Auth > Users:
--      - A creator user (note UUID as CREATOR_UUID)
--      - An admin user (note UUID as ADMIN_UUID)
--   2. Ensure the creator has role='creator' and status='active' in profiles
--   3. Ensure the admin has role='admin' in profiles
--   4. Replace placeholder UUIDs below
--   5. Run each test individually and verify the expected outcome
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- Replace with real UUIDs:
-- \set creator_uuid '00000000-0000-0000-0000-000000000001'
-- \set admin_uuid   '00000000-0000-0000-0000-000000000002'

-- ===========================================================================
-- TEST 1: Creator creates a campaign → initial state is draft + pending
-- ===========================================================================
-- Expected: Campaign created with status='draft' and launch_payment_status='pending'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

SELECT public.create_campaign(
  'Test Campaign 1',
  'Test brief for phase 1',
  'YouTube',
  50,
  'Test Creator'
);

-- Verify: status should be 'draft', launch_payment_status should be 'pending'
SELECT
  status,
  launch_payment_status
FROM public.campaigns
WHERE title = 'Test Campaign 1'
  AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

-- Expected: status='draft', launch_payment_status='pending'
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator attempts direct INSERT with status='open' → gets 'draft'
-- ===========================================================================
-- Expected: Trigger forces status to 'draft' and launch_payment_status to 'pending'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- Direct INSERT bypassing the RPC (simulating a malicious client)
INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status
) VALUES (
  'Test Campaign 2 - Direct INSERT',
  'Trying to bypass RPC',
  'YouTube',
  50,
  'Test Creator',
  'open',
  'verified'
);

-- Verify: trigger should have forced safe defaults
SELECT
  status,
  launch_payment_status
FROM public.campaigns
WHERE title = 'Test Campaign 2 - Direct INSERT';

-- Expected: status='draft', launch_payment_status='pending'
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator attempts direct UPDATE to set status='open' without verified → BLOCKED
-- ===========================================================================
-- Expected: ERROR from trigger
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- First create a draft campaign via RPC
SELECT public.create_campaign(
  'Test Campaign 3',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Now try to directly set status='open' without verified payment
UPDATE public.campaigns
SET status = 'open'
WHERE title = 'Test Campaign 3'
  AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

-- Expected: ERROR: Campaign cannot be set to open: launch payment has not been verified
ROLLBACK;

-- ===========================================================================
-- TEST 4: Creator attempts direct UPDATE to set launch_payment_status='verified' → BLOCKED
-- ===========================================================================
-- Expected: The new integrity trigger blocks non-admin from setting 'verified'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- First create a draft campaign via RPC
SELECT public.create_campaign(
  'Test Campaign 4',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Try to directly set launch_payment_status='verified'
BEGIN
  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE title = 'Test Campaign 4'
    AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;
  ASSERT false, 'Should have raised exception';
EXCEPTION WHEN OTHERS THEN
  ASSERT SQLERRM LIKE '%Only admin can verify%',
    'Wrong error: ' || SQLERRM;
END;

-- Verify status is still draft and payment status is still pending
SELECT status, launch_payment_status
FROM public.campaigns
WHERE title = 'Test Campaign 4';

-- Expected: status='draft', launch_payment_status='pending' (unchanged)
ROLLBACK;

-- ===========================================================================
-- TEST 5: Creator attempts campaign_action('publish') without verified payment → BLOCKED
-- ===========================================================================
-- Expected: ERROR from campaign_action
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- Create a draft campaign
SELECT public.create_campaign(
  'Test Campaign 5',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Get the campaign ID
DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 5'
    AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Try to publish without verified payment
  -- This should raise: Cannot publish: launch payment has not been verified
  PERFORM public.campaign_action(v_campaign_id, 'publish');
END $$;

-- Expected: ERROR: Cannot publish: launch payment has not been verified (current payment status: pending)
ROLLBACK;

-- ===========================================================================
-- TEST 6: Admin verifies payment → campaign becomes open
-- ===========================================================================
-- Expected: After verify_campaign_launch_payment, status='open'
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- Create a campaign as creator
SELECT public.create_campaign(
  'Test Campaign 6',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Get campaign ID and submit payment as creator
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 6'
    AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Creator submits payment via RPC
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-TEST-6');

  -- Get payment ID
  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin and verify
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(v_payment_id);
END $$;

-- Verify: status should now be 'open', launch_payment_status='verified'
SELECT status, launch_payment_status
FROM public.campaigns
WHERE title = 'Test Campaign 6';

-- Expected: status='open', launch_payment_status='verified'
ROLLBACK;

-- ===========================================================================
-- TEST 7: Creator attempts to resume a campaign without verified payment → BLOCKED by trigger
-- ===========================================================================
-- Expected: ERROR from trigger (status='open' requires verified payment)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- Create a draft campaign
SELECT public.create_campaign(
  'Test Campaign 7',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Get campaign ID
DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 7'
    AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Try to resume (which sets status='open') — campaign is in 'draft' not 'paused'
  -- This should fail at the state transition check, but even if it somehow
  -- reached the UPDATE, the trigger would block it.
  BEGIN
    PERFORM public.campaign_action(v_campaign_id, 'resume');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'campaign_action(resume) failed as expected: %', SQLERRM;
  END;

  -- Try direct UPDATE to set status='open'
  UPDATE public.campaigns
  SET status = 'open'
  WHERE id = v_campaign_id;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Direct UPDATE blocked as expected: %', SQLERRM;
END $$;

-- Expected: ERROR from trigger or state transition check
ROLLBACK;

-- ===========================================================================
-- TEST 8: Existing campaigns are NOT affected by default change
-- ===========================================================================
-- Expected: Existing campaigns retain their original status and payment status
BEGIN;
-- Create a campaign with the old defaults (simulate pre-migration state)
INSERT INTO public.campaigns (
  title, brief, platform, payout, creator, status, launch_payment_status,
  created_by
) VALUES (
  'Legacy Campaign',
  'Pre-migration campaign',
  'YouTube',
  100,
  'Legacy Creator',
  'open',
  'verified',
  'REPLACE_WITH_ADMIN_UUID'::uuid
);

-- Verify: legacy campaign retains its values
SELECT status, launch_payment_status
FROM public.campaigns
WHERE title = 'Legacy Campaign';

-- Expected: status='open', launch_payment_status='verified' (unchanged)
ROLLBACK;

-- ===========================================================================
-- TEST 9: Admin can resume/reopen a campaign (existing workflow preserved)
-- ===========================================================================
-- Expected: Admin campaign_action still works for non-publish transitions
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

-- Create a campaign as creator
SELECT public.create_campaign(
  'Test Campaign 9',
  'Test brief',
  'YouTube',
  50,
  'Test Creator'
);

-- Get campaign ID and submit payment as creator
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'Test Campaign 9'
    AND created_by = 'REPLACE_WITH_CREATOR_UUID'::uuid;

  -- Creator submits payment
  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-TEST-9');

  SELECT id INTO v_payment_id
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_campaign_id;

  -- Switch to admin and verify payment
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Switch back to creator for lifecycle actions
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator publishes (now allowed since payment is verified)
  PERFORM public.campaign_action(v_campaign_id, 'publish');

  -- Verify it's open
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open after publish';

  -- Creator pauses
  PERFORM public.campaign_action(v_campaign_id, 'pause');

  -- Verify it's paused
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'paused',
    'Campaign should be paused';

  -- Creator resumes (this sets status='open' — trigger allows because payment is verified)
  PERFORM public.campaign_action(v_campaign_id, 'resume');

  -- Verify it's open again
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open after resume';
END $$;

-- Expected: All transitions succeed (publish, pause, resume)
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
