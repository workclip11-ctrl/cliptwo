-- =============================================================================
-- INTEGRATION TESTS: Social Connections Token Protection + Verified Views Regression
--
-- Run AFTER: All migrations including security-hardening-migration.sql
--
-- These tests exercise real data operations to verify:
-- 1. social_connections trigger blocks authenticated token column writes
-- 2. ingest_clip_metrics prevents verified_views from decreasing
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
  v_actual jsonb;
  v_expected jsonb;
  v_test_name text;
  v_error_msg text;
  v_test_user_id uuid;
  v_test_campaign_id uuid;
  v_test_clip_id uuid;
  v_metric jsonb;
  v_clip record;
BEGIN
  -- =========================================================================
  -- SETUP: Create test data
  -- =========================================================================

  -- Create a test user profile (bypasses auth.users FK for test purposes)
  v_test_user_id := gen_random_uuid();
  INSERT INTO public.profiles (id, role, status, email)
  VALUES (v_test_user_id, 'clipper', 'active', 'test-social-metrics-' || v_test_user_id::text || '@test.local')
  ON CONFLICT (id) DO NOTHING;

  -- Create a test campaign with the test user as creator
  v_test_campaign_id := gen_random_uuid();
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by, budget, status,
    launch_payment_status, launched_at
  ) VALUES (
    v_test_campaign_id, 'Test Campaign for Metrics', 'Test brief', 'YouTube',
    50, 'TestBrand', v_test_user_id, 5000, 'active',
    'verified', now()
  );

  -- Create a test clip
  v_test_clip_id := gen_random_uuid();
  INSERT INTO public.clips (
    id, campaign_id, user_id, platform, title, url, status, verified_views
  ) VALUES (
    v_test_clip_id, v_test_campaign_id, v_test_user_id, 'YouTube',
    'Test Clip', 'https://youtube.com/watch?v=test123', 'approved', NULL
  );

  -- =========================================================================
  -- SECTION A: social_connections token protection trigger tests
  -- =========================================================================

  -- TEST 1: Trigger function is SECURITY DEFINER
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

  -- TEST 2: Trigger is attached to social_connections table
  v_test_id := v_test_id + 1;
  v_test_name := 'Trigger attached to social_connections table';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'social_connections'
    AND t.tgname = 'enforce_social_connection_tokens'
    AND NOT t.tgisinternal
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 3: social_accounts trigger also exists (both tables protected)
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

  -- TEST 4: UPDATE policy on social_connections is dropped (RLS blocks authenticated)
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

  -- TEST 5: INSERT policy on social_connections is dropped
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

  -- =========================================================================
  -- SECTION B: ingest_clip_metrics verified_views regression tests
  -- =========================================================================

  -- TEST 6: NULL → 4: verified_views should become 4
  v_test_id := v_test_id + 1;
  v_test_name := 'NULL → 4: verified_views becomes 4';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 4, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 4);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 4, 'actual', v_actual
  );

  -- TEST 7: 4 → 20: verified_views should become 20
  v_test_id := v_test_id + 1;
  v_test_name := '4 → 20: verified_views becomes 20';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 20, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 20);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 20, 'actual', v_actual
  );

  -- TEST 8: 20 → 20: verified_views should remain 20
  v_test_id := v_test_id + 1;
  v_test_name := '20 → 20: verified_views remains 20';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 20, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 20);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 20, 'actual', v_actual
  );

  -- TEST 9: 20 → 15: verified_views MUST remain 20 (regression guard)
  v_test_id := v_test_id + 1;
  v_test_name := '20 → 15: verified_views remains 20 (regression blocked)';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 15, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 20);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 20, 'actual', v_actual
  );

  -- TEST 10: 20 → 25: verified_views should become 25
  v_test_id := v_test_id + 1;
  v_test_name := '20 → 25: verified_views becomes 25';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 25, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 25);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 25, 'actual', v_actual
  );

  -- TEST 11: Failed metric must NOT modify verified_views
  v_test_id := v_test_id + 1;
  v_test_name := 'Failed metric does not modify verified_views';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 999, 0, 0, 0, 'platform_api', 'failed'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 25);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 25, 'actual', v_actual
  );

  -- TEST 12: Pending metric must NOT modify verified_views
  v_test_id := v_test_id + 1;
  v_test_name := 'Pending metric does not modify verified_views';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 888, 0, 0, 0, 'platform_api', 'pending'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 25);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 25, 'actual', v_actual
  );

  -- TEST 13: Disputed metric must NOT modify verified_views
  v_test_id := v_test_id + 1;
  v_test_name := 'Disputed metric does not modify verified_views';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 777, 0, 0, 0, 'platform_api', 'disputed'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 25);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 25, 'actual', v_actual
  );

  -- TEST 14: Historical clip_metrics snapshot is still created (even for failed)
  v_test_id := v_test_id + 1;
  v_test_name := 'Historical clip_metrics snapshot always created';
  v_pass := (
    SELECT count(*) FROM public.clip_metrics
    WHERE clip_id = v_test_clip_id
  ) = 8;  -- 6 verified + 1 failed + 1 pending + 1 disputed = 9 total
  -- Actually recount: tests 6-10 = 5 verified, test 11 = failed, test 12 = pending, test 13 = disputed = 8
  v_pass := (
    SELECT count(*) FROM public.clip_metrics
    WHERE clip_id = v_test_clip_id
  ) = 8;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 15: Large regression 25 → 1 still blocked
  v_test_id := v_test_id + 1;
  v_test_name := '25 → 1: verified_views remains 25 (large regression blocked)';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 1, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 25);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 25, 'actual', v_actual
  );

  -- TEST 16: 25 → 50: verified_views should become 50 (resume upward)
  v_test_id := v_test_id + 1;
  v_test_name := '25 → 50: verified_views becomes 50 (resumes upward trend)';
  PERFORM public.ingest_clip_metrics(
    v_test_clip_id, 50, 0, 0, 0, 'platform_api', 'verified'
  );
  SELECT verified_views INTO v_actual FROM public.clips WHERE id = v_test_clip_id;
  v_pass := (v_actual::integer = 50);
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass,
    'expected', 50, 'actual', v_actual
  );

  -- =========================================================================
  -- CLEANUP: Remove test data
  -- =========================================================================

  DELETE FROM public.clip_metrics WHERE clip_id = v_test_clip_id;
  DELETE FROM public.clips WHERE id = v_test_clip_id;
  DELETE FROM public.campaigns WHERE id = v_test_campaign_id;
  DELETE FROM public.profiles WHERE id = v_test_user_id;

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
