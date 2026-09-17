-- ===========================================================================
-- DELETE CAMPAIGN TESTS
-- ===========================================================================
-- Run in Supabase SQL Editor to verify creator hard-delete enforcement.
--
-- IMPORTANT: Run tests ONE AT A TIME (select a single test block, then Run).
-- BEGIN/ROLLBACK isolation may not work when the entire file is sent as one
-- query in the Supabase SQL Editor.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Other:   11111111-1111-1111-1111-111111111111
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Each test uses a deterministic UUID for its campaign to avoid SELECT
-- ambiguity from stale data in the database.
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000001'::uuid
);

DO $$
DECLARE
  v_exists boolean;
BEGIN
  PERFORM public.delete_campaign('a0000000-0000-0000-0000-000000000001'::uuid);

  SELECT EXISTS(SELECT 1 FROM public.campaigns WHERE id = 'a0000000-0000-0000-0000-000000000001'::uuid) INTO v_exists;
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000002'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_exists boolean;
BEGIN
  -- Must publish first: submit payment, then admin verifies
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-2');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  -- Switch back to creator
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000003'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_err text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-3');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000004'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000004'::uuid;
  v_err text;
BEGIN
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000005'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000005'::uuid;
  v_err text;
BEGIN
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
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'Delete Test 7 - Admin Delete'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000007'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000007'::uuid;
  v_err text;
BEGIN
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000008'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000008'::uuid;
  v_err text;
BEGIN
  PERFORM public.submit_campaign_launch_payment(v_id, 'UTR-TEST-8');
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(
    (SELECT id FROM public.campaign_launch_payments WHERE campaign_id = v_id)
  );
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000009'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000009'::uuid;
  v_count integer;
BEGIN
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
  'Test Creator'::text,
  'a0000000-0000-0000-0000-000000000010'::uuid
);

DO $$
DECLARE
  v_id uuid := 'a0000000-0000-0000-0000-000000000010'::uuid;
  v_clips integer;
BEGIN
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
