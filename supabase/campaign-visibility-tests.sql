-- ===========================================================================
-- CAMPAIGN VISIBILITY & RLS TESTS — Phase 4
-- ===========================================================================
-- Run in Supabase SQL Editor to verify campaign visibility security.
--
-- Prerequisites:
--   1. Run supabase/campaign-visibility.sql FIRST (creates the RLS policies)
--   2. Create test users in Supabase Dashboard > Auth > Users:
--      - A creator user (note UUID as CREATOR_UUID)
--      - A clipper user (note UUID as CLIPPER_UUID)
--      - An admin user (note UUID as ADMIN_UUID)
--   3. Ensure creator has role='creator' and status='active' in profiles
--   4. Ensure clipper has role='clipper' and status='active' in profiles
--   5. Ensure admin has role='admin' in profiles
--   6. Replace ALL placeholder UUIDs before running
--
-- Auth pattern: always SET LOCAL role = 'authenticated'.
-- Admin is simulated via JWT claims only (is_admin() checks auth.uid()).
-- ===========================================================================

-- Replace with real UUIDs from Supabase Dashboard > Auth > Users:
-- \set creator_uuid '00000000-0000-0000-0000-000000000001'
-- \set clipper_uuid '00000000-0000-0000-0000-000000000002'
-- \set admin_uuid   '00000000-0000-0000-0000-000000000003'

-- Helper: insert campaign bypassing RLS (SECURITY DEFINER runs as owner)
CREATE OR REPLACE FUNCTION public._test_insert_campaign(
  p_title text,
  p_created_by uuid,
  p_status text DEFAULT 'draft',
  p_launch_payment_status text DEFAULT 'pending'
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
    0, p_status, p_launch_payment_status
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ===========================================================================
-- TEST 1: Creator sees own campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 1',
    'REPLACE_WITH_CREATOR_UUID'::uuid
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 1,
    'Creator should see own campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator cannot see another creator's campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 2',
    '00000000-0000-0000-0000-999999999999'::uuid,
    'open', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Creator should NOT see other creator campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator cannot update another creator's campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 3',
    '00000000-0000-0000-0000-999999999999'::uuid,
    'open', 'verified'
  );

  UPDATE public.campaigns SET title = 'HACKED' WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Creator should NOT update other creator campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Clipper cannot see draft campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 4',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'draft', 'pending'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see draft campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Clipper cannot see submitted payment campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 5',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'draft', 'submitted'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see submitted campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Clipper cannot see rejected payment campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 6',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'draft', 'rejected'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see rejected campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Clipper CAN see verified + open campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 7',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'open', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 1,
    'Clipper SHOULD see open+verified campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Clipper cannot see verified + closed campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 8',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'closed', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see closed campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Clipper cannot see verified + paused campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 9',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'paused', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see paused campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Clipper cannot see verified + budget_reached campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 10',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'budget_reached', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see budget_reached campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: Clipper cannot change launch_payment_status
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CLIPPER_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 11',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'draft', 'pending'
  );

  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Clipper should NOT update launch_payment_status';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 11 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 12: Creator can directly set launch_payment_status (demonstrates need for RPC workflow)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 12',
    'REPLACE_WITH_CREATOR_UUID'::uuid
  );

  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;

  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'Direct UPDATE bypasses payment workflow — demonstrates need for RPC enforcement';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 12 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 13: Creator cannot force unpaid campaign to open (trigger blocks)
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 13',
    'REPLACE_WITH_CREATOR_UUID'::uuid
  );

  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%launch payment has not been verified%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 13 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 14: Admin can see all campaign states
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  )
  SELECT
    'Admin Test ' || s, 'Brief', 'YouTube', 0, 'Creator',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    0, s, 'verified'
  FROM unnest(ARRAY['draft','open','closed','paused','archived','budget_reached','near_budget']) AS s;

  SELECT count(*) INTO v_count FROM public.campaigns WHERE title LIKE 'Admin Test %';
  ASSERT v_count = 7, 'Admin should see all 7 campaign states, saw ' || v_count;

  DELETE FROM public.campaigns WHERE title LIKE 'Admin Test %';
END $$;

SELECT 'TEST 14 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 15: Anonymous user cannot access campaign rows
-- ===========================================================================
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 15',
    'REPLACE_WITH_CREATOR_UUID'::uuid,
    'open', 'verified'
  );

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Anonymous should NOT see campaign rows';

  -- Cleanup (switch to authenticated to delete)
  PERFORM set_config('request.jwt.claims', '{"sub": "REPLACE_WITH_ADMIN_UUID", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 15 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 16: Campaign IDOR — Creator A cannot operate on Creator B's campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "REPLACE_WITH_CREATOR_UUID", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  v_id := public._test_insert_campaign(
    'Visibility Test 16',
    '00000000-0000-0000-0000-999999999999'::uuid,
    'open', 'verified'
  );

  -- SELECT: should see 0 rows
  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Creator A should NOT see Creator B campaign via SELECT';

  -- UPDATE: should affect 0 rows
  UPDATE public.campaigns SET title = 'HACKED' WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Creator A should NOT update Creator B campaign';

  -- DELETE: should affect 0 rows
  DELETE FROM public.campaigns WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Creator A should NOT delete Creator B campaign';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 16 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- Cleanup helper function
-- ===========================================================================
DROP FUNCTION IF EXISTS public._test_insert_campaign(text, uuid, text, text);

-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- TEST  1: Creator sees own campaign
-- TEST  2: Creator cannot see another creator's campaign
-- TEST  3: Creator cannot update another creator's campaign
-- TEST  4: Clipper cannot see draft campaign
-- TEST  5: Clipper cannot see submitted campaign
-- TEST  6: Clipper cannot see rejected campaign
-- TEST  7: Clipper CAN see verified + open campaign
-- TEST  8: Clipper cannot see verified + closed campaign
-- TEST  9: Clipper cannot see verified + paused campaign
-- TEST 10: Clipper cannot see verified + budget_reached campaign
-- TEST 11: Clipper cannot change launch_payment_status
-- TEST 12: Creator can directly set launch_payment_status (demonstrates need for RPC workflow)
-- TEST 13: Creator cannot force unpaid campaign to open (trigger blocks)
-- TEST 14: Admin can see all campaign states
-- TEST 15: Anonymous user cannot access campaign rows
-- TEST 16: Campaign IDOR — Creator A blocked on Creator B's campaign
