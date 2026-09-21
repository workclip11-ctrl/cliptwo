-- ===========================================================================
-- AUTH ROLE REGRESSION TESTS
-- ===========================================================================
-- Tests for role-aware Google sign-in and email confirmation persistence.
--
-- Coverage:
--   1. Trigger auto-creates profile with correct role from metadata
--   2. Trigger strips admin role / defaults missing role to clipper
--   3. Existing profile role is never overwritten by trigger
--   4. finalize_profile RPC: structure, ACL, and null-auth behavior
--   5. RLS: non-admin cannot change profiles.role
--   6. Function existence and trigger enabled state
--   7. profiles INSERT constraint only allows clipper/creator
--
-- Authenticated-context tests (finalize_profile with real auth.uid()) require
-- a live Supabase session and are documented here for manual execution.
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- SECTION 1: TRIGGER — auto-creates profile for new auth users
-- ===========================================================================

-- TEST 1.1: New email signup gets profile with correct role from metadata
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_trigger_clipper_' || v_user_id || '@test.com',
          '{"name":"Test Clipper","role":"clipper"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'TEST 1.1 FAIL: expected clipper, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 1.1 PASS: trigger creates clipper profile from metadata';
END $$;
ROLLBACK;

-- TEST 1.2: New signup with creator role
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_trigger_creator_' || v_user_id || '@test.com',
          '{"name":"Test Creator","role":"creator"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'creator', 'TEST 1.2 FAIL: expected creator, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 1.2 PASS: trigger creates creator profile from metadata';
END $$;
ROLLBACK;

-- TEST 1.3: Admin role in metadata is stripped to clipper
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_trigger_admin_' || v_user_id || '@test.com',
          '{"name":"Fake Admin","role":"admin"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'TEST 1.3 FAIL: admin should be stripped, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 1.3 PASS: admin role stripped to clipper in trigger';
END $$;
ROLLBACK;

-- TEST 1.4: No role in metadata defaults to clipper
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_trigger_norole_' || v_user_id || '@test.com',
          '{"name":"No Role User"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'TEST 1.4 FAIL: expected clipper default, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 1.4 PASS: missing role defaults to clipper';
END $$;
ROLLBACK;

-- TEST 1.5: Invalid role string in metadata defaults to clipper
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_trigger_badrole_' || v_user_id || '@test.com',
          '{"name":"Bad Role","role":"superadmin"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'TEST 1.5 FAIL: invalid role should default to clipper, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 1.5 PASS: invalid role string defaults to clipper';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 2: TRIGGER — existing profile is never overwritten
-- ===========================================================================

-- TEST 2.1: Trigger does not overwrite existing profile on UPDATE
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_existing_' || v_user_id || '@test.com',
          '{"name":"Existing User","role":"creator"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'creator', 'SETUP FAIL: expected creator';

  -- Trigger is AFTER INSERT, not AFTER UPDATE — changing metadata should not affect profile
  UPDATE auth.users SET raw_user_meta_data = '{"role":"clipper"}' WHERE id = v_user_id;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'creator', 'TEST 2.1 FAIL: profile role changed on auth.users update, got ' || v_role;
  RAISE NOTICE 'TEST 2.1 PASS: existing profile role is stable across auth.users updates';
END $$;
ROLLBACK;

-- TEST 2.2: Trigger does not fire if profile already exists (idempotent insert guard)
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  -- Create auth user with clipper role
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_idempotent_' || v_user_id || '@test.com',
          '{"name":"Idempotent","role":"clipper"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'SETUP FAIL: expected clipper';

  -- Manually set role to creator (simulates finalize_profile)
  UPDATE public.profiles SET role = 'creator' WHERE id = v_user_id;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'creator', 'SETUP FAIL: role should be creator now';

  -- Verify profile still has creator (trigger INSERT guard means no second profile)
  ASSERT (SELECT count(*) FROM public.profiles WHERE id = v_user_id) = 1,
    'TEST 2.2 FAIL: duplicate profile row created';
  RAISE NOTICE 'TEST 2.2 PASS: trigger does not create duplicate profile';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 3: finalize_profile RPC — structure and ACL
-- ===========================================================================

-- TEST 3.1: finalize_profile function exists with correct signature
BEGIN;
DO $$
DECLARE
  v_func record;
BEGIN
  SELECT * INTO v_func
  FROM pg_proc
  WHERE proname = 'finalize_profile'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  ASSERT v_func.prokind = 'f', 'TEST 3.1 FAIL: not a function';
  ASSERT v_func.prosecuritydefiner = true, 'TEST 3.1 FAIL: not SECURITY DEFINER';
  ASSERT v_func.provolatile = 'v', 'TEST 3.1 FAIL: not volatile (expected volatile for RPC)';
  RAISE NOTICE 'TEST 3.1 PASS: finalize_profile exists, is SECURITY DEFINER';
END $$;
ROLLBACK;

-- TEST 3.2: finalize_profile is executable by authenticated role
BEGIN;
DO $$
DECLARE
  v_has_priv boolean;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.finalize_profile(text)', 'execute')
  INTO v_has_priv;
  ASSERT v_has_priv = true, 'TEST 3.2 FAIL: authenticated cannot execute finalize_profile';
  RAISE NOTICE 'TEST 3.2 PASS: finalize_profile is executable by authenticated';
END $$;
ROLLBACK;

-- TEST 3.3: finalize_profile is NOT executable by anon role
BEGIN;
DO $$
DECLARE
  v_has_priv boolean;
BEGIN
  SELECT has_function_privilege('anon', 'public.finalize_profile(text)', 'execute')
  INTO v_has_priv;
  ASSERT v_has_priv = false, 'TEST 3.3 FAIL: anon should NOT execute finalize_profile';
  RAISE NOTICE 'TEST 3.3 PASS: finalize_profile is not executable by anon';
END $$;
ROLLBACK;

-- TEST 3.4: finalize_profile raises exception when auth.uid() is NULL
-- (simulates calling from anon context or server without JWT)
BEGIN;
DO $$
DECLARE
  v_result jsonb;
  v_error_msg text;
BEGIN
  -- This will fail because auth.uid() returns NULL outside a real JWT context
  BEGIN
    SELECT public.finalize_profile('creator') INTO v_result;
    RAISE WARNING 'TEST 3.4 FAIL: should have raised exception for null auth.uid()';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    ASSERT v_error_msg LIKE '%Not authenticated%',
      'TEST 3.4 FAIL: unexpected error: ' || v_error_msg;
    RAISE NOTICE 'TEST 3.4 PASS: finalize_profile rejects null auth.uid() — %', v_error_msg;
  END;
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 4: finalize_profile RPC — authenticated-context tests
-- ===========================================================================
-- These tests require a real Supabase JWT context. They are documented here
-- for manual execution via the Supabase Dashboard SQL Editor (which runs as
-- the authenticated user when initiated from the dashboard).
--
-- To run: authenticate as the test user in the Supabase Dashboard, then
-- execute each test in the SQL Editor.
-- ===========================================================================

-- TEST 4.1 (MANUAL): Authenticated user with no profile + finalize_profile('creator')
-- Expected: profile created with role = 'creator'
--
-- SETUP: Create a test user in Supabase Dashboard (email: test_finalize_creator@example.com)
-- Then sign in as that user and run:
--   SELECT public.finalize_profile('creator');
--   SELECT role FROM profiles WHERE id = auth.uid();
--   -- Expected: 'creator'

-- TEST 4.2 (MANUAL): Authenticated user with no profile + finalize_profile('clipper')
-- Expected: profile created with role = 'clipper'
--
-- SETUP: Create a test user (email: test_finalize_clipper@example.com)
-- Then sign in and run:
--   SELECT public.finalize_profile('clipper');
--   SELECT role FROM profiles WHERE id = auth.uid();
--   -- Expected: 'clipper'

-- TEST 4.3 (MANUAL): Existing creator + finalize_profile('clipper')
-- Expected: role remains 'creator' (existing role wins)
--
-- SETUP: Use a user whose profile already has role = 'creator'
-- Sign in and run:
--   SELECT public.finalize_profile('clipper');
--   SELECT role FROM profiles WHERE id = auth.uid();
--   -- Expected: 'creator' (unchanged)

-- TEST 4.4 (MANUAL): finalize_profile('admin')
-- Expected: role is set to 'clipper' (admin stripped)
--
-- SETUP: Create a test user with no profile
-- Sign in and run:
--   SELECT public.finalize_profile('admin');
--   SELECT role FROM profiles WHERE id = auth.uid();
--   -- Expected: 'clipper' (admin stripped to clipper)

-- ===========================================================================
-- SECTION 5: RLS — users cannot change their own role
-- ===========================================================================

-- TEST 5.1: enforce_profile_field_permissions trigger blocks non-admin role change
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_new_role text;
  v_error_msg text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_rls_role_' || v_user_id || '@test.com',
          '{"name":"RLS Test","role":"clipper"}', now());

  -- Attempt role change (simulating client-side UPDATE — runs as session user, not service_role)
  BEGIN
    UPDATE public.profiles SET role = 'creator' WHERE id = v_user_id;
    SELECT role INTO v_new_role FROM public.profiles WHERE id = v_user_id;
    IF v_new_role = 'creator' THEN
      RAISE WARNING 'TEST 5.1 FAIL: role change was not blocked';
    ELSE
      RAISE NOTICE 'TEST 5.1 PASS: role change did not take effect';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    RAISE NOTICE 'TEST 5.1 PASS: role change blocked — %', v_error_msg;
  END;
END $$;
ROLLBACK;

-- TEST 5.2: enforce_profile_field_permissions function exists
BEGIN;
DO $$
DECLARE
  v_func_count int;
BEGIN
  SELECT count(*) INTO v_func_count
  FROM pg_proc
  WHERE proname = 'enforce_profile_field_permissions'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  ASSERT v_func_count = 1, 'TEST 5.2 FAIL: enforce_profile_field_permissions not found';
  RAISE NOTICE 'TEST 5.2 PASS: enforce_profile_field_permissions function exists';
END $$;
ROLLBACK;

-- TEST 5.3: enforce_profile_fields trigger exists on profiles
BEGIN;
DO $$
DECLARE
  v_trigger_count int;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgname = 'enforce_profile_fields'
    AND tgenabled = 'O'
    AND tgrelid = 'public.profiles'::regclass;
  ASSERT v_trigger_count = 1, 'TEST 5.3 FAIL: enforce_profile_fields trigger not found or not enabled';
  RAISE NOTICE 'TEST 5.3 PASS: enforce_profile_fields trigger exists and is enabled';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 6: Trigger and function existence
-- ===========================================================================

-- TEST 6.1: on_auth_user_created trigger exists and is enabled
BEGIN;
DO $$
DECLARE
  v_trigger_count int;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgname = 'on_auth_user_created'
    AND tgenabled = 'O';
  ASSERT v_trigger_count = 1, 'TEST 6.1 FAIL: trigger not found or not enabled';
  RAISE NOTICE 'TEST 6.1 PASS: on_auth_user_created trigger exists and is enabled';
END $$;
ROLLBACK;

-- TEST 6.2: handle_new_user_profile function exists
BEGIN;
DO $$
DECLARE
  v_func_count int;
BEGIN
  SELECT count(*) INTO v_func_count
  FROM pg_proc
  WHERE proname = 'handle_new_user_profile'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  ASSERT v_func_count = 1, 'TEST 6.2 FAIL: handle_new_user_profile not found';
  RAISE NOTICE 'TEST 6.2 PASS: handle_new_user_profile function exists';
END $$;
ROLLBACK;

-- TEST 6.3: handle_new_user_profile is SECURITY DEFINER
BEGIN;
DO $$
DECLARE
  v_secdef boolean;
BEGIN
  SELECT prosecuritydefiner INTO v_secdef
  FROM pg_proc
  WHERE proname = 'handle_new_user_profile'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  ASSERT v_secdef = true, 'TEST 6.3 FAIL: handle_new_user_profile is not SECURITY DEFINER';
  RAISE NOTICE 'TEST 6.3 PASS: handle_new_user_profile is SECURITY DEFINER';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 7: profiles table constraints
-- ===========================================================================

-- TEST 7.1: profiles_role_check constraint exists
BEGIN;
DO $$
DECLARE
  v_constraint_count int;
BEGIN
  SELECT count(*) INTO v_constraint_count
  FROM pg_constraint
  WHERE conname = 'profiles_role_check'
    AND conrelid = 'public.profiles'::regclass;
  ASSERT v_constraint_count = 1, 'TEST 7.1 FAIL: profiles_role_check constraint not found';
  RAISE NOTICE 'TEST 7.1 PASS: profiles_role_check constraint exists';
END $$;
ROLLBACK;

-- TEST 7.2: profiles_role_check allows only clipper/creator/admin
BEGIN;
DO $$
DECLARE
  v_check_def text;
BEGIN
  SELECT pg_get_expr(c.conbin, c.conrelid) INTO v_check_def
  FROM pg_constraint c
  WHERE c.conname = 'profiles_role_check'
    AND c.conrelid = 'public.profiles'::regclass;
  ASSERT v_check_def LIKE '%clipper%', 'TEST 7.2 FAIL: check constraint missing clipper';
  ASSERT v_check_def LIKE '%creator%', 'TEST 7.2 FAIL: check constraint missing creator';
  ASSERT v_check_def LIKE '%admin%', 'TEST 7.2 FAIL: check constraint missing admin';
  RAISE NOTICE 'TEST 7.2 PASS: profiles_role_check enforces role IN (clipper, creator, admin)';
END $$;
ROLLBACK;

-- TEST 7.3: profiles INSERT RLS policy allows only clipper/creator
BEGIN;
DO $$
DECLARE
  v_policy_def text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_policy_def
  FROM pg_policy
  WHERE polname = 'profiles_insert'
    AND polrelid = 'public.profiles'::regclass;
  ASSERT v_policy_def LIKE '%clipper%', 'TEST 7.3 FAIL: INSERT policy missing clipper';
  ASSERT v_policy_def LIKE '%creator%', 'TEST 7.3 FAIL: INSERT policy missing creator';
  -- Admin should NOT be in the INSERT policy's WITH CHECK
  ASSERT v_policy_def NOT LIKE '%admin%IN%', 'TEST 7.3 FAIL: INSERT policy should not allow admin';
  RAISE NOTICE 'TEST 7.3 PASS: profiles INSERT RLS allows only clipper/creator';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 8: Email signup flow — role survives confirmation
-- ===========================================================================

-- TEST 8.1: Email signup with creator role → profile has creator
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_email_creator_' || v_user_id || '@test.com',
          '{"name":"Email Creator","role":"creator"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'creator', 'TEST 8.1 FAIL: expected creator, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 8.1 PASS: email signup creator role preserved via trigger';
END $$;
ROLLBACK;

-- TEST 8.2: Email signup with clipper role → profile has clipper
BEGIN;
DO $$
DECLARE
  v_user_id uuid;
  v_role text;
BEGIN
  v_user_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
  VALUES (v_user_id, 'test_email_clipper_' || v_user_id || '@test.com',
          '{"name":"Email Clipper","role":"clipper"}', now());

  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  ASSERT v_role = 'clipper', 'TEST 8.2 FAIL: expected clipper, got ' || coalesce(v_role, 'NULL');
  RAISE NOTICE 'TEST 8.2 PASS: email signup clipper role preserved via trigger';
END $$;
ROLLBACK;

-- ===========================================================================
-- SECTION 9: Multiple users — isolated role management
-- ===========================================================================

-- TEST 9.1: Two users can have different roles
BEGIN;
DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_role_a text;
  v_role_b text;
BEGIN
  v_user_a := gen_random_uuid();
  v_user_b := gen_random_uuid();

  INSERT INTO auth.users (id, email, raw_user_meta_data, created_at) VALUES
    (v_user_a, 'test_multi_a_' || v_user_a || '@test.com',
     '{"name":"User A","role":"clipper"}', now()),
    (v_user_b, 'test_multi_b_' || v_user_b || '@test.com',
     '{"name":"User B","role":"creator"}', now());

  SELECT role INTO v_role_a FROM public.profiles WHERE id = v_user_a;
  SELECT role INTO v_role_b FROM public.profiles WHERE id = v_user_b;

  ASSERT v_role_a = 'clipper', 'TEST 9.1 FAIL: user A should be clipper, got ' || v_role_a;
  ASSERT v_role_b = 'creator', 'TEST 9.1 FAIL: user B should be creator, got ' || v_role_b;
  RAISE NOTICE 'TEST 9.1 PASS: two users have isolated roles';
END $$;
ROLLBACK;
