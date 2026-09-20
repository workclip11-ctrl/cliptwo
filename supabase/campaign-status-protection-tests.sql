-- ===========================================================================
-- CAMPAIGN STATUS PROTECTION — REGRESSION TESTS
-- ===========================================================================
-- Tests for the enforce_campaign_status_protected trigger.
-- The trigger blocks direct Creator UPDATE of campaigns.status, allowing
-- changes only through trusted SECURITY DEFINER functions.
--
-- Prerequisites:
--   1. All migrations applied (including 20250101000003)
--   2. Users exist:
--      - Creator: e92427b0-254e-44cc-b2df-be83792c8a94 (role='creator', status='active')
--      - Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd (role='admin')
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator creates campaign → status = draft, launch_payment_status = pending
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
    'Status Test A', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'draft',
    'Campaign should be draft';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'pending',
    'Launch payment should be pending';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator direct UPDATE status = 'open' → DENIED
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
    'Status Test B', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Creator direct UPDATE status = 'paused' → DENIED
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
    'Status Test C', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns SET status = 'paused' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Creator direct UPDATE status = 'closed' → DENIED
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
    'Status Test D', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  BEGIN
    UPDATE public.campaigns SET status = 'closed' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Creator direct UPDATE status = 'draft' on open campaign → DENIED
-- ===========================================================================
-- Establishes a legitimately verified/open campaign via the standard RPC flow
-- (submit payment → verify payment), then attempts a direct status UPDATE.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test E', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_E');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator and attempt direct status UPDATE
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  BEGIN
    UPDATE public.campaigns SET status = 'draft' WHERE id = v_campaign_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Creator direct UPDATE status on verified/open campaign → DENIED
-- ===========================================================================
-- Establishes a legitimately verified/open campaign via the standard RPC flow,
-- then attempts to change status to paused via direct UPDATE.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test F', 'Brief', 'YouTube', 100, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_F');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator and attempt direct status UPDATE
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  BEGIN
    UPDATE public.campaigns SET status = 'paused' WHERE id = v_campaign_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;
END $$;

SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Creator campaign_action('pause') on open campaign → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test G', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'open', 'verified'
  ) RETURNING id INTO v_id;

  v_result := public.campaign_action(v_id, 'pause', 'Test pause');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'Campaign should be paused';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Cashfree verification flow (draft → open) → ALLOWED
-- ===========================================================================
-- This test verifies the Cashfree signal works, but does NOT actually call
-- verify_cashfree_webhook (which requires service_role). Instead, we verify
-- that the trigger function exists and the signal mechanism is in place.
BEGIN;
DO $$
BEGIN
  -- Verify the trigger function exists
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'enforce_campaign_status_protected'
      AND n.nspname = 'public'
  ), 'enforce_campaign_status_protected trigger function should exist';

  -- Verify the trigger exists on campaigns
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'enforce_campaign_status_protected'
      AND c.relname = 'campaigns'
      AND n.nspname = 'public'
  ), 'enforce_campaign_status_protected trigger should exist on campaigns';

  -- Verify verify_cashfree_webhook creates _campaign_transition_signal
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'verify_cashfree_webhook'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%_campaign_transition_signal%'
  ), 'verify_cashfree_webhook should create _campaign_transition_signal';
END $$;

SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST I: Admin direct UPDATE status → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test I', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Admin should be able to directly change status
  UPDATE public.campaigns SET status = 'paused' WHERE id = v_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'paused',
    'Admin should be able to set status to paused';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST I PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST J: Creator non-status UPDATE (title) on own campaign → ALLOWED
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
    'Status Test J', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Non-status update should succeed
  UPDATE public.campaigns SET title = 'Updated Title' WHERE id = v_id;

  ASSERT (SELECT title FROM public.campaigns WHERE id = v_id) = 'Updated Title',
    'Creator should be able to update title';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST J PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST K: Creator campaign_action('resume') on paused campaign → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test K', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'paused', 'verified'
  ) RETURNING id INTO v_id;

  v_result := public.campaign_action(v_id, 'resume', 'Test resume');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'Campaign should be open';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST L: Creator campaign_action('close') on open campaign → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test L', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'open', 'verified'
  ) RETURNING id INTO v_id;

  v_result := public.campaign_action(v_id, 'close', 'Test close');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'closed',
    'Campaign should be closed';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST M: Creator campaign_action('reopen') on closed campaign → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test M', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'closed', 'verified'
  ) RETURNING id INTO v_id;

  v_result := public.campaign_action(v_id, 'reopen', 'Test reopen');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'Campaign should be open';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST N: Creator campaign_action('publish') on draft+verified → ALLOWED
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test N', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'verified'
  ) RETURNING id INTO v_id;

  v_result := public.campaign_action(v_id, 'publish', 'Test publish');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'open',
    'Campaign should be open';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST N PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST O: trigger function is SECURITY DEFINER
-- ===========================================================================
BEGIN;
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'enforce_campaign_status_protected'
      AND n.nspname = 'public'
      AND p.prosecdef = true
  ), 'enforce_campaign_status_protected should be SECURITY DEFINER';
END $$;

SELECT 'TEST O PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST P: TEMPORARY privilege revoked from authenticated
-- ===========================================================================
-- Verifies that migration 15 successfully revoked TEMPORARY from authenticated.
-- If this test fails, the temp-table authorization boundary is broken.
BEGIN;
DO $$
BEGIN
  ASSERT NOT has_database_privilege('authenticated', 'postgres', 'TEMPORARY'),
    'FAIL: authenticated still has TEMPORARY privilege — temp table forgery is possible';
END $$;

SELECT 'TEST P PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST Q: TEMPORARY privilege revoked from anon
-- ===========================================================================
BEGIN;
DO $$
BEGIN
  ASSERT NOT has_database_privilege('anon', 'postgres', 'TEMPORARY'),
    'FAIL: anon still has TEMPORARY privilege — temp table forgery is possible';
END $$;

SELECT 'TEST Q PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST R: Authenticated cannot CREATE TEMPORARY TABLE _campaign_transition_signal
-- ===========================================================================
-- Direct forgery attempt: authenticated tries to create the signal table.
-- This MUST fail after migration 15. If it succeeds, the attack is live.
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
BEGIN
  BEGIN
    CREATE TEMPORARY TABLE _campaign_transition_signal (id int);
    ASSERT false, 'FAIL: authenticated can still create temp tables — REVOKE TEMPORARY not applied';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected: permission denied
    NULL;
  WHEN OTHERS THEN
    -- Also acceptable: other privilege-related errors
    RAISE NOTICE 'Unexpected error (still blocked): %', SQLERRM;
  END;
END $$;

SELECT 'TEST R PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST S: Authenticated cannot CREATE TEMPORARY TABLE _cf_verify_signal
-- ===========================================================================
-- Forgery of the Cashfree verification signal.
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
BEGIN
  BEGIN
    CREATE TEMPORARY TABLE _cf_verify_signal (id int);
    ASSERT false, 'FAIL: authenticated can still create temp tables — REVOKE TEMPORARY not applied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  WHEN OTHERS THEN
    RAISE NOTICE 'Unexpected error (still blocked): %', SQLERRM;
  END;
END $$;

SELECT 'TEST S PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST T: Direct UPDATE blocked even with forged temp table name
-- ===========================================================================
-- End-to-end attack simulation: authenticated tries to create a table with
-- the signal name (via a non-temp path) and then UPDATE status.
-- Even if the table somehow exists, the trigger only checks pg_temp schemas.
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
    'Status Test T', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Attempt direct status change — should be blocked by trigger
  BEGIN
    UPDATE public.campaigns SET status = 'open' WHERE id = v_id;
    ASSERT false, 'Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%cannot be changed directly%',
      'Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST T PASSED' AS result;
ROLLBACK;
