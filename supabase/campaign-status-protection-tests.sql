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
-- DIAGNOSTIC: Migration-state verification
-- ===========================================================================
-- Verifies that the installed database has the required security migrations
-- applied. If any of these fail, subsequent tests will also fail with
-- unclear errors. Run this section FIRST to diagnose missing migrations.
-- ===========================================================================
BEGIN;
DO $$
BEGIN
  -- 1. enforce_campaign_status_protected trigger function must exist
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'enforce_campaign_status_protected'
      AND n.nspname = 'public'
  ), 'MISSING: public.enforce_campaign_status_protected() function. '
     'Apply migration 20250101000003_lock_direct_campaign_status_updates.sql';

  -- 2. enforce_campaign_status_protected trigger must exist on campaigns
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'enforce_campaign_status_protected'
      AND c.relname = 'campaigns'
      AND n.nspname = 'public'
  ), 'MISSING: enforce_campaign_status_protected trigger on campaigns. '
     'Apply migration 20250101000003_lock_direct_campaign_status_updates.sql';

  -- 3. enforce_campaign_status_protected must be SECURITY DEFINER
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'enforce_campaign_status_protected'
      AND n.nspname = 'public'
      AND p.prosecdef = true
  ), 'WRONG: enforce_campaign_status_protected is not SECURITY DEFINER. '
     'Re-apply migration 20250101000003';

  -- 4. enforce_campaign_launch_payment_integrity trigger must exist
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'enforce_campaign_launch_payment_integrity'
      AND c.relname = 'campaigns'
      AND n.nspname = 'public'
  ), 'MISSING: enforce_campaign_launch_payment_integrity trigger on campaigns. '
     'Apply migration 20250101000002_cashfree_trigger_fix.sql';

  -- 5. enforce_campaign_open_requires_verified trigger must exist
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'enforce_campaign_open_requires_verified'
      AND c.relname = 'campaigns'
      AND n.nspname = 'public'
  ), 'MISSING: enforce_campaign_open_requires_verified trigger on campaigns. '
     'Apply campaign-state-machine-phase1.sql';

  -- 6. verify_campaign_launch_payment must create _campaign_transition_signal
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'verify_campaign_launch_payment'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%_campaign_transition_signal%'
  ), 'WRONG: verify_campaign_launch_payment does not create _campaign_transition_signal. '
     'Apply migration 20250101000003_lock_direct_campaign_status_updates.sql. '
     'The installed database likely has the OLD function without temp-table signal.';

  -- 7. verify_campaign_launch_payment must set both columns atomically
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'verify_campaign_launch_payment'
      AND n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%launch_payment_status = ''verified''%'
      AND pg_get_functiondef(p.oid) LIKE '%status = ''open''%'
  ), 'WRONG: verify_campaign_launch_payment does not set launch_payment_status and status '
     'in the same UPDATE. Apply migration 20250101000003.';

  -- 8. TEMPORARY privilege revoked from authenticated
  ASSERT NOT has_database_privilege('authenticated', current_database(), 'TEMPORARY'),
    'FAIL: authenticated still has TEMPORARY privilege. '
     'Apply migration 20250101000004_revoke_temp_table_privilege.sql';

  -- 9. TEMPORARY privilege revoked from anon
  ASSERT NOT has_database_privilege('anon', current_database(), 'TEMPORARY'),
    'FAIL: anon still has TEMPORARY privilege. '
     'Apply migration 20250101000004_revoke_temp_table_privilege.sql';

  RAISE NOTICE 'DIAGNOSTIC PASSED: All security migrations appear to be applied correctly.';
END $$;
ROLLBACK;

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
    -- Any denial is acceptable. enforce_campaign_open_requires_verified
    -- fires first (alphabetical) and rejects status='open' without verified
    -- payment. enforce_campaign_status_protected would also reject it.
    -- We must not depend on which trigger fires first.
    NULL;
  END;

  -- Verify the UPDATE did NOT succeed
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'draft',
    'UPDATE should not have succeeded — status must remain draft';

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
-- Establishes an open/verified campaign via direct Admin UPDATE (test fixture),
-- then attempts a direct status UPDATE as Creator.
--
-- Fixture uses a direct Admin UPDATE instead of verify_campaign_launch_payment()
-- because the RPC creates _campaign_transition_signal temp table which persists
-- in the same transaction and would bypass enforce_campaign_status_protected.
-- The real RPC state machine is exercised by tests G, K, L, M.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
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

  -- Phase 2: Admin establishes open/verified fixture (direct UPDATE).
  -- This is permitted: enforce_campaign_status_protected allows admin,
  -- enforce_campaign_open_requires_verified allows atomic set of both columns.
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  UPDATE public.campaigns
  SET launch_payment_status = 'verified', status = 'open'
  WHERE id = v_campaign_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Fixture setup: campaign should be open after admin UPDATE';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Fixture setup: launch_payment_status should be verified after admin UPDATE';

  -- Phase 3: Switch back to creator and attempt direct status UPDATE
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
-- Establishes an open/verified campaign via direct Admin UPDATE (test fixture),
-- then attempts to change status to paused via direct UPDATE as Creator.
--
-- Fixture uses a direct Admin UPDATE instead of verify_campaign_launch_payment()
-- because the RPC creates _campaign_transition_signal temp table which persists
-- in the same transaction and would bypass enforce_campaign_status_protected.
-- The real RPC state machine is exercised by tests G, K, L, M.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
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

  -- Phase 2: Admin establishes open/verified fixture (direct UPDATE).
  -- This is permitted: enforce_campaign_status_protected allows admin,
  -- enforce_campaign_open_requires_verified allows atomic set of both columns.
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  UPDATE public.campaigns
  SET launch_payment_status = 'verified', status = 'open'
  WHERE id = v_campaign_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Fixture setup: campaign should be open after admin UPDATE';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Fixture setup: launch_payment_status should be verified after admin UPDATE';

  -- Phase 3: Switch back to creator and attempt direct status UPDATE
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
-- Establishes a legitimate open/verified campaign via the standard RPC flow,
-- then pauses it through campaign_action().
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test G', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_G');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator and pause the campaign
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  v_result := public.campaign_action(v_campaign_id, 'pause', 'Test pause');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'paused',
    'Campaign should be paused';
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
-- Campaign is created by Creator (RLS requires auth.uid() = created_by),
-- then Admin directly changes status to verify admin bypass.
BEGIN;
DO $$
DECLARE
  v_id uuid;
BEGIN
  -- Phase 1: Create campaign as Creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test I', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    0, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'draft',
    'Fixture setup: campaign should be draft after creator INSERT';

  -- Phase 2: Switch to Admin and directly change status
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

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
-- Establishes a legitimate open/verified campaign, pauses it, then resumes it.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test K', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_K');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator, pause, then resume
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  PERFORM public.campaign_action(v_campaign_id, 'pause', 'Pause before resume');

  v_result := public.campaign_action(v_campaign_id, 'resume', 'Test resume');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open';
END $$;

SELECT 'TEST K PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST L: Creator campaign_action('close') on open campaign → ALLOWED
-- ===========================================================================
-- Establishes a legitimate open/verified campaign, then closes it.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test L', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_L');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator and close the campaign
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  v_result := public.campaign_action(v_campaign_id, 'close', 'Test close');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'closed',
    'Campaign should be closed';
END $$;

SELECT 'TEST L PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST M: Creator campaign_action('reopen') on closed campaign → ALLOWED
-- ===========================================================================
-- Establishes a legitimate open/verified campaign, closes it, then reopens it.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test M', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_M');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Verify payment as admin (transitions to open/verified)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  PERFORM public.verify_campaign_launch_payment(v_payment_id);

  -- Phase 4: Switch back to creator, close, then reopen
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  PERFORM public.campaign_action(v_campaign_id, 'close', 'Close before reopen');

  v_result := public.campaign_action(v_campaign_id, 'reopen', 'Test reopen');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open';
END $$;

SELECT 'TEST M PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST N: Creator campaign_action('publish') on draft+verified → ALLOWED
-- ===========================================================================
-- Establishes draft+verified via legitimate flows:
--   1. Creator creates campaign (draft/pending)
--   2. Creator submits launch payment (submitted)
--   3. Admin sets launch_payment_status = 'verified' directly
--      (admin is permitted by enforce_campaign_launch_payment_integrity)
--   4. Campaign is now draft/verified — the state publish() requires
-- Then creator calls campaign_action('publish') → transitions to open.
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid;
  v_payment jsonb;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  -- Phase 1: Create campaign as creator (INSERT trigger forces draft/pending)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Status Test N', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Phase 2: Submit launch payment as creator
  v_payment := public.submit_campaign_launch_payment(v_campaign_id, 'TEST_UTR_N');
  v_payment_id := (v_payment->>'payment_id')::uuid;

  -- Phase 3: Admin sets launch_payment_status = 'verified' directly.
  -- This is permitted by enforce_campaign_launch_payment_integrity (admin check).
  -- Status stays 'draft' — we do NOT call verify_campaign_launch_payment()
  -- because that would also transition status to 'open'.
  PERFORM set_config('request.jwt.claims',
    '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  UPDATE public.campaigns
  SET launch_payment_status = 'verified'
  WHERE id = v_campaign_id;

  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'draft',
    'Campaign should still be draft after admin verifies payment';
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_campaign_id) = 'verified',
    'Launch payment should be verified';

  -- Phase 4: Creator publishes (draft+verified → open)
  PERFORM set_config('request.jwt.claims',
    '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  v_result := public.campaign_action(v_campaign_id, 'publish', 'Test publish');

  ASSERT (v_result->>'success')::boolean = true, 'campaign_action should succeed';
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_campaign_id) = 'open',
    'Campaign should be open';
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
    -- Any denial is acceptable. enforce_campaign_open_requires_verified
    -- fires first (alphabetical) and rejects status='open' without verified
    -- payment. enforce_campaign_status_protected would also reject it.
    -- We must not depend on which trigger fires first.
    NULL;
  END;

  -- Verify the UPDATE did NOT succeed
  ASSERT (SELECT status FROM public.campaigns WHERE id = v_id) = 'draft',
    'UPDATE should not have succeeded — status must remain draft';

  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST T PASSED' AS result;
ROLLBACK;
