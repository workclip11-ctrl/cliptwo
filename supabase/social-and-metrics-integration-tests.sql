-- =============================================================================
-- INTEGRATION TESTS: Social Connections Token Protection + Verified Views Regression
--
-- Run AFTER: All migrations including security-hardening-migration.sql
--
-- These tests verify structural properties of the functions/triggers:
-- 1. social_connections trigger exists and is correctly configured
-- 2. ingest_clip_metrics contains the verified_views regression guard
--
-- No test data is created (FK constraints prevent fake user creation).
--
-- Usage: SELECT * FROM public.run_social_metrics_integration_tests();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_social_metrics_integration_tests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_test_id integer := 0;
  v_pass boolean;
  v_test_name text;
  v_funcdef text;
BEGIN
  -- =========================================================================
  -- SECTION A: social_connections token protection trigger tests
  -- =========================================================================

  -- TEST 1: Trigger function exists
  v_test_id := v_test_id + 1;
  v_test_name := 'enforce_social_connection_token_protection function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'enforce_social_connection_token_protection'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 2: Trigger function is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'Token trigger function is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'enforce_social_connection_token_protection'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 3: Trigger is BEFORE UPDATE on social_connections
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger is BEFORE UPDATE on social_connections';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'social_connections'
    AND t.tgname = 'enforce_social_connection_tokens'
    AND NOT t.tgisinternal
    AND t.tgtype & 4 = 4   -- BEFORE
    AND t.tgtype & 2 = 2   -- UPDATE
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 4: social_accounts trigger also exists (both tables protected)
  v_test_id := v_test_id + 1;
  v_test_name := 'Both social_accounts and social_connections have protection triggers';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'social_accounts'
    AND t.tgname = 'enforce_social_account_fields'
    AND NOT t.tgisinternal
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 5: UPDATE policy on social_connections is dropped
  v_test_id := v_test_id + 1;
  v_test_name := 'UPDATE policy on social_connections is dropped';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'social_connections'
    AND policyname = 'social_connections_update'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 6: INSERT policy on social_connections is dropped
  v_test_id := v_test_id + 1;
  v_test_name := 'INSERT policy on social_connections is dropped';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'social_connections'
    AND policyname = 'social_connections_insert'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 7: Trigger function blocks access_token_enc changes
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger blocks access_token_enc changes';
  v_funcdef := pg_get_functiondef(
    (SELECT p.oid FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
     AND p.proname = 'enforce_social_connection_token_protection')
  );
  v_pass := v_funcdef LIKE '%access_token_enc%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 8: Trigger function blocks refresh_token_enc changes
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger blocks refresh_token_enc changes';
  v_pass := v_funcdef LIKE '%refresh_token_enc%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 9: Trigger function blocks expires_at changes
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger blocks expires_at changes';
  v_pass := v_funcdef LIKE '%expires_at%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 10: Trigger function blocks scope changes
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger blocks scope changes';
  v_pass := v_funcdef LIKE '%scope%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 11: Trigger function blocks provider_meta changes
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger blocks provider_meta changes';
  v_pass := v_funcdef LIKE '%provider_meta%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 12: Trigger function allows service_role bypass (auth.uid() IS NULL)
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger allows service_role bypass';
  v_pass := v_funcdef LIKE '%auth.uid() IS NULL%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 13: Trigger function allows admin bypass
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger allows admin bypass';
  v_pass := v_funcdef LIKE '%is_admin()%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION B: ingest_clip_metrics verified_views regression guard tests
  -- =========================================================================

  -- TEST 14: ingest_clip_metrics function exists
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ingest_clip_metrics'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 15: ingest_clip_metrics is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'ingest_clip_metrics'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 16: ingest_clip_metrics restricted to service_role only
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics restricted to service_role';
  v_pass := NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 17: ingest_clip_metrics contains CASE regression guard
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics contains verified_views regression guard';
  v_funcdef := pg_get_functiondef(
    (SELECT p.oid FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
     AND p.proname = 'ingest_clip_metrics')
  );
  v_pass := v_funcdef LIKE '%CASE%'
    AND v_funcdef LIKE '%verified_views%'
    AND v_funcdef LIKE '%ELSE%verified_views%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 18: Regression guard uses NULL check (accepts first value)
  v_test_id := v_test_id + 1;
  v_test_name := 'Regression guard accepts NULL → value';
  v_pass := v_funcdef LIKE '%IS NULL%THEN%p_views%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 19: Regression guard uses > comparison (accepts higher)
  v_test_id := v_test_id + 1;
  v_test_name := 'Regression guard accepts value → higher value';
  v_pass := v_funcdef LIKE '%> v_clip.verified_views%THEN%p_views%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 20: Regression guard preserves current value (ELSE branch)
  v_test_id := v_test_id + 1;
  v_test_name := 'Regression guard preserves current value when new is lower';
  v_pass := v_funcdef LIKE '%ELSE%v_clip.verified_views%';
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- RESULTS
  -- =========================================================================

  RETURN jsonb_build_object(
    'total_tests', v_test_id,
    'all_passed', (SELECT bool_and((t->>'PASS')::boolean) FROM jsonb_array_elements(v_results) AS t),
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_social_metrics_integration_tests() TO authenticated;
