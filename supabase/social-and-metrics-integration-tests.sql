-- =============================================================================
-- INTEGRATION TESTS: Social Connections Token Protection + Verified Views Regression
--
-- Run AFTER: All migrations including security-hardening-migration.sql
--
-- These tests verify structural properties of the functions/triggers:
-- 1. social_connections trigger exists and is correctly configured
-- 2. ingest_clip_metrics contains the verified_views regression guard
-- 3. OAuth state table supports CSRF (unique state, expiry, PKCE, redirect)
-- 4. Encrypted token columns + RLS stay fail-closed for browsers
-- 5. last_sync_at exists (sync routes write it after verified ingest)
-- 6. ingest_clip_metrics stays service_role-only
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
  -- SECTION C: OAuth state, encrypted storage, ownership & sync structure
  -- =========================================================================

  -- TEST 21: social_oauth_states.state is UNIQUE (one-time-use CSRF lookup)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_oauth_states.state is UNIQUE';
  v_pass := EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class t ON i.indrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public' AND t.relname = 'social_oauth_states'
    AND i.indisunique
    AND pg_get_indexdef(i.indexrelid) LIKE '%(state)%'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 22: social_oauth_states.expires_at is NOT NULL (expiry enforced)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_oauth_states.expires_at is NOT NULL';
  v_pass := EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    AND c.table_name = 'social_oauth_states'
    AND c.column_name = 'expires_at'
    AND c.is_nullable = 'NO'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 23: social_oauth_states has code_verifier (PKCE for YouTube)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_oauth_states has code_verifier column';
  v_pass := EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    AND c.table_name = 'social_oauth_states'
    AND c.column_name = 'code_verifier'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 24: social_oauth_states has redirect_to (validated return path)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_oauth_states has redirect_to column';
  v_pass := EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    AND c.table_name = 'social_oauth_states'
    AND c.column_name = 'redirect_to'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 25: social_oauth_states has NO permissive SELECT policy for browsers
  v_test_id := v_test_id + 1;
  v_test_name := 'social_oauth_states has no SELECT policy';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'social_oauth_states'
    AND cmd = 'SELECT'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 26: social_connections has UNIQUE constraint on social_account_id
  -- (required for the OAuth callback upsert on conflict target)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections unique on social_account_id';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class t ON con.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.relname = 'social_connections'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) LIKE '%(social_account_id)%'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 27: social_accounts has UNIQUE (user_id, platform) — one row per platform
  v_test_id := v_test_id + 1;
  v_test_name := 'social_accounts unique on (user_id, platform)';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class t ON con.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.relname = 'social_accounts'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) LIKE '%(user_id, platform)%'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 28: Token columns are encrypted-at-rest text columns (access/refresh)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections token columns exist (access_token_enc, refresh_token_enc)';
  v_pass :=
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      AND c.table_name = 'social_connections'
      AND c.column_name = 'access_token_enc'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      AND c.table_name = 'social_connections'
      AND c.column_name = 'refresh_token_enc'
    );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 29: social_connections SELECT policy denies all browser reads
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections SELECT policy is USING (false)';
  v_pass := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'social_connections'
    AND cmd = 'SELECT'
    AND qual = 'false'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 30: social_accounts.last_sync_at column exists (written by sync routes)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_accounts.last_sync_at column exists';
  v_pass := EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    AND c.table_name = 'social_accounts'
    AND c.column_name = 'last_sync_at'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 31: ingest_clip_metrics NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics: anon cannot execute';
  v_pass := NOT has_function_privilege(
    'anon',
    'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)',
    'EXECUTE'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 32: ingest_clip_metrics IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics: service_role can execute';
  v_pass := has_function_privilege(
    'service_role',
    'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)',
    'EXECUTE'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 33: social_accounts SELECT policy scoped to own rows (RLS not weakened)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_accounts SELECT policy scoped to auth.uid()';
  v_pass := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'social_accounts'
    AND cmd = 'SELECT'
    AND qual LIKE '%auth.uid() = user_id%'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 34: social_accounts.status check constraint includes connection_error
  -- (refresh-failure path sets this status — must remain a legal value)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_accounts status allows connection_error';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class t ON con.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.relname = 'social_accounts'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%connection_error%'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 35: social_connections RLS is enabled (tokens never bypass RLS)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_class t
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.relname = 'social_connections'
    AND t.relrowsecurity = true
  );
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
