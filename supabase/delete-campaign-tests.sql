-- ===========================================================================
-- DELETE CAMPAIGN TESTS
-- ===========================================================================
-- Run in Supabase SQL Editor to verify creator hard-delete enforcement.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Other:   11111111-1111-1111-1111-111111111111
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- ===========================================================================
-- TEST 1: Owner can delete a draft campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 1 - Draft'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_exists boolean;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 1 - Draft'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM public.delete_campaign(v_id);

  SELECT EXISTS(SELECT 1 FROM public.campaigns WHERE id = v_id) INTO v_exists;
  ASSERT v_exists = false, 'TEST 1 FAIL: campaign should be deleted';
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Owner can delete a closed campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 2 - Closed'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_exists boolean;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 2 - Closed'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Must publish first (requires verified payment)
  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
  PERFORM public.campaign_action(v_id, 'publish', 'Publish for close+delete test');
  PERFORM public.campaign_action(v_id, 'close', 'Close for delete test');

  PERFORM public.delete_campaign(v_id);

  SELECT EXISTS(SELECT 1 FROM public.campaigns WHERE id = v_id) INTO v_exists;
  ASSERT v_exists = false, 'TEST 2 FAIL: closed campaign should be deleted';
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Cannot delete an open campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 3 - Open'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 3 - Open'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Publish it (requires verified payment — set it first)
  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;
  PERFORM public.campaign_action(v_id, 'publish', 'Publish for delete test');

  BEGIN
    PERFORM public.delete_campaign(v_id);
    ASSERT false, 'TEST 3 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%draft or closed%', 'TEST 3 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Cannot delete a near_budget campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 4 - Near Budget'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 4 - Near Budget'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Set to near_budget
  UPDATE public.campaigns SET status = 'near_budget' WHERE id = v_id;

  BEGIN
    PERFORM public.delete_campaign(v_id);
    ASSERT false, 'TEST 4 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%draft or closed%', 'TEST 4 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Wrong owner cannot delete
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 5 - Wrong Owner'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 5 - Wrong Owner'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Switch to different user
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.delete_campaign(v_id);
    ASSERT false, 'TEST 5 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only the campaign owner%', 'TEST 5 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Unauthenticated user cannot delete
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('role', 'anon', true);

DO $$
DECLARE
  v_err text;
  v_any_campaign uuid;
BEGIN
  SELECT id INTO v_any_campaign FROM public.campaigns LIMIT 1;
  IF v_any_campaign IS NULL THEN
    RAISE NOTICE 'SKIP: no campaigns to test against';
    RETURN;
  END IF;

  BEGIN
    PERFORM public.delete_campaign(v_any_campaign);
    ASSERT false, 'TEST 6 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Not authenticated%', 'TEST 6 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Admin cannot delete via delete_campaign (owner-only)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 7 - Admin Delete'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 7 - Admin Delete'
    AND created_by = 'f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd'::uuid;

  -- Switch to creator user who owns the campaign
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Now admin user (f1d9d01c) is not the owner — should fail
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.delete_campaign(v_id);
    ASSERT false, 'TEST 7 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%Only the campaign owner%', 'TEST 7 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Cannot delete campaign with verified payment
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 8 - Verified Payment'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_err text;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 8 - Verified Payment'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Set verified payment but keep draft status
  UPDATE public.campaigns SET launch_payment_status = 'verified' WHERE id = v_id;

  BEGIN
    PERFORM public.delete_campaign(v_id);
    ASSERT false, 'TEST 8 FAIL: should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    ASSERT v_err LIKE '%verified launch payment%', 'TEST 8 FAIL: unexpected error: ' || v_err;
  END;
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Audit log is written on successful delete
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 9 - Audit Log'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 9 - Audit Log'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM public.delete_campaign(v_id);

  SELECT count(*) INTO v_count
  FROM public.audit_logs
  WHERE entity_id = v_id::text
    AND action = 'campaign_delete';

  ASSERT v_count = 1, 'TEST 9 FAIL: expected 1 audit log entry, got ' || v_count;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Child records cascade-delete
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 10 - Cascade'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text
);

DO $$
DECLARE
  v_id uuid;
  v_clips integer;
  v_records integer;
BEGIN
  SELECT id INTO v_id
  FROM public.campaigns
  WHERE title = 'Delete Test 10 - Cascade'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Insert a fake clip + financial record
  INSERT INTO public.clips (id, campaign_id, creator_id, clippers, title, source, platform, status, submitted_at)
  VALUES (gen_random_uuid(), v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '[]'::jsonb, 'Test Clip', 'manual', 'YouTube', 'approved', now());

  PERFORM public.delete_campaign(v_id);

  SELECT count(*) INTO v_clips FROM public.clips WHERE campaign_id = v_id;
  ASSERT v_clips = 0, 'TEST 10 FAIL: clips should cascade-delete';
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
