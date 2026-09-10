-- ===========================================================================
-- CAMPAIGN VISIBILITY & RLS TESTS — Phase 4
-- ===========================================================================
-- Run in Supabase SQL Editor to verify campaign visibility security.
--
-- Prerequisites:
--   1. Run supabase/campaign-visibility.sql FIRST (creates the RLS policies)
--   2. Ensure these test users exist with correct roles in profiles:
--      - Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--      - Clipper: fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--      - Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Auth pattern: SET LOCAL role = 'authenticated' + SET LOCAL request.jwt.claims.
-- All cross-user inserts use admin context via set_config() then switch back.
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- TEST 1: Creator sees own campaign
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
    'Visibility Test 1', 'Test brief', 'YouTube', 0, 'Test Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

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
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Admin-context insert via set_config
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 2', 'Test brief', 'YouTube', 0, 'Other Creator',
    '00000000-0000-0000-0000-999999999999'::uuid,
    0, 'open', 'verified'
  ) RETURNING id INTO v_id;

  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Creator should NOT see other creator campaign';

  -- Cleanup as admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Creator cannot update another creator's campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 3', 'Test brief', 'YouTube', 0, 'Other Creator',
    '00000000-0000-0000-0000-999999999999'::uuid,
    0, 'open', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.campaigns SET title = 'HACKED' WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Creator should NOT update other creator campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Clipper cannot see draft campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 4', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see draft campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Clipper cannot see submitted payment campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 5', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see submitted campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Clipper cannot see rejected payment campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 6', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'rejected'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see rejected campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Clipper CAN see verified + open campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 7', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'open', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 1,
    'Clipper SHOULD see open+verified campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Clipper cannot see verified + closed campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 8', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'closed', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see closed campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Clipper cannot see verified + paused campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 9', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'paused', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see paused campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Clipper cannot see verified + budget_reached campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 10', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'budget_reached', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Clipper should NOT see budget_reached campaign';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 11: Clipper cannot change launch_payment_status
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 11', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'Clipper should NOT update launch_payment_status';

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 11 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 12: Creator can directly set launch_payment_status (demonstrates need for RPC workflow)
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
    'Visibility Test 12', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;

  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'verified',
    'Direct UPDATE bypasses payment workflow';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 12 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 13: Creator cannot force unpaid campaign to open (trigger blocks)
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
    'Visibility Test 13', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

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
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';

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
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
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
  -- Insert as admin first (anon can't insert)
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 15', 'Test brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'open', 'verified'
  ) RETURNING id INTO v_id;

  -- Switch to anon
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('role', 'anon', true);

  ASSERT (SELECT count(*) FROM public.campaigns WHERE id = v_id) = 0,
    'Anonymous should NOT see campaign rows';

  -- Cleanup as admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
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
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Visibility Test 16', 'Test brief', 'YouTube', 0, 'Other Creator',
    '00000000-0000-0000-0000-999999999999'::uuid,
    0, 'open', 'verified'
  ) RETURNING id INTO v_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

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

  -- Cleanup as admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST 16 PASSED' AS result;
ROLLBACK;

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
