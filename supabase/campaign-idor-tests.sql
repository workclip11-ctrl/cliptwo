-- ===========================================================================
-- CAMPAIGN IDOR & CROSS-USER SECURITY TESTS
-- ===========================================================================
-- Tests for Insecure Direct Object Reference (IDOR) protection,
-- cross-creator access control, and authorization boundaries.
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Creator B: 11111111-1111-1111-1111-111111111111
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--
-- Tests use BEGIN/ROLLBACK so no data is persisted.
-- ===========================================================================

-- ===========================================================================
-- TEST 1: Creator A cannot SELECT Creator B's campaigns (RLS)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 1 - Creator A Campaign'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 1 - Creator A Campaign'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.campaigns WHERE id = v_campaign_id;
  ASSERT v_count = 0, 'TEST 1 FAIL: Creator B can see Creator A campaign, count=' || v_count;
END $$;

SELECT 'TEST 1 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 2: Creator A cannot SELECT Creator B's campaigns by created_by filter
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 2 - Creator A Campaign'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.campaigns
  WHERE created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;
  ASSERT v_count = 0, 'TEST 2 FAIL: Creator B can filter by Creator A UUID, count=' || v_count;
END $$;

SELECT 'TEST 2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 3: Clipper cannot submit clip to draft campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 3 - Draft Campaign'::text,
  'Brief'::text,
  'Instagram'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 3 - Draft Campaign'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.submit_clip(v_campaign_id, 'Test caption', 'https://example.com/video1.mp4', 'Instagram');
    ASSERT false, 'TEST 3 FAIL: submit_clip to draft campaign should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not open%',
      'TEST 3 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 4: Clipper cannot submit clip to open campaign with unverified payment
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

-- Create campaign and force it to open with pending payment (simulate legacy row)
SELECT public.create_campaign(
  'IDOR Test 4 - Unverified Open'::text,
  'Brief'::text,
  'Instagram'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 4 - Unverified Open'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  -- Admin bypass: set status=open with payment_status=pending (simulate legacy)
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.campaigns SET status = 'open', launch_payment_status = 'pending' WHERE id = v_campaign_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.submit_clip(v_campaign_id, 'Test caption', 'https://example.com/video2.mp4', 'Instagram');
    ASSERT false, 'TEST 4 FAIL: submit_clip to unverified campaign should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%launch payment has not been verified%',
      'TEST 4 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 5: Clipper cannot submit clip to closed campaign
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 5 - Closed Campaign'::text,
  'Brief'::text,
  'Instagram'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 5 - Closed Campaign'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  UPDATE public.campaigns SET status = 'closed' WHERE id = v_campaign_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  BEGIN
    PERFORM public.submit_clip(v_campaign_id, 'Test caption', 'https://example.com/video3.mp4', 'Instagram');
    ASSERT false, 'TEST 5 FAIL: submit_clip to closed campaign should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not open%',
      'TEST 5 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 5 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 6: Creator cannot directly UPDATE launch_payment_status to 'rejected'
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 6 - Rejected Payment'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 6 - Rejected Payment'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    UPDATE public.campaigns SET launch_payment_status = 'rejected' WHERE id = v_campaign_id;
    ASSERT false, 'TEST 6 FAIL: creator should not be able to set rejected status';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admin can%',
      'TEST 6 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 7: Clipper cannot UPDATE campaigns directly (RLS blocks)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 7 - Clipper UPDATE'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 7 - Clipper UPDATE'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  UPDATE public.campaigns SET title = 'HACKED BY CLIPPER' WHERE id = v_campaign_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'TEST 7 FAIL: clipper UPDATE should be blocked, but ' || v_rows || ' rows updated';
END $$;

SELECT 'TEST 7 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 8: Clipper cannot DELETE campaigns (admin-only policy)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 8 - Clipper DELETE'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_rows integer;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 8 - Clipper DELETE'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  DELETE FROM public.campaigns WHERE id = v_campaign_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, 'TEST 8 FAIL: clipper DELETE should be blocked, but ' || v_rows || ' rows deleted';
END $$;

SELECT 'TEST 8 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 9: Creator cannot call admin_campaign_action (non-admin)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 9 - Creator Admin Action'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 9 - Creator Admin Action'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  BEGIN
    PERFORM public.admin_campaign_action(v_campaign_id, 'pause');
    ASSERT false, 'TEST 9 FAIL: creator calling admin_campaign_action should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Only admins%',
      'TEST 9 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 9 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST 10: Admin cannot verify payment twice (idempotency)
-- ===========================================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
SELECT set_config('role', 'authenticated', true);

SELECT public.create_campaign(
  'IDOR Test 10 - Double Verify'::text,
  'Brief'::text,
  'YouTube'::text,
  50::numeric,
  'Creator A'::text
);

DO $$
DECLARE
  v_campaign_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT id INTO v_campaign_id
  FROM public.campaigns
  WHERE title = 'IDOR Test 10 - Double Verify'
    AND created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;

  PERFORM public.submit_campaign_launch_payment(v_campaign_id, 'UTR-DOUBLE-VERIFY');
  SELECT id INTO v_payment_id FROM public.campaign_launch_payments WHERE campaign_id = v_campaign_id;

  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  BEGIN
    PERFORM public.verify_campaign_launch_payment(v_payment_id);
    ASSERT false, 'TEST 10 FAIL: double verify should fail';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%already verified%',
      'TEST 10 FAIL: wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST 10 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
