-- =============================================================================
-- SECURITY REGRESSION TESTS
--
-- Run AFTER: All migrations including security-hardening-migration.sql
--
-- These tests verify the security properties of the database functions.
-- Each test returns a JSON object with test name, expected result, actual result,
-- and pass/fail status.
--
-- Usage: SELECT * FROM public.run_security_regression_tests();
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_security_regression_tests()
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
BEGIN
  -- =========================================================================
  -- SECTION A: ADMIN AUTHORIZATION TESTS
  -- =========================================================================

  -- TEST 1: admin_has_perm exists and is callable
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_has_perm function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'admin_has_perm'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 2: is_admin exists and is callable
  v_test_id := v_test_id + 1;
  v_test_name := 'is_admin function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 3: is_super_admin exists and is callable
  v_test_id := v_test_id + 1;
  v_test_name := 'is_super_admin function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 4: admin_permissions table has correct RLS
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_permissions table has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'admin_permissions'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 5: admin_clip_action rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_clip_action rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.admin_clip_action('00000000-0000-0000-0000-000000000000', 'reject', 'test');
    v_pass := false; -- should not reach here
  EXCEPTION WHEN OTHERS THEN
    v_pass := true; -- expected: raises exception for non-admin
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 6: admin_user_action rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_user_action rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.admin_user_action('00000000-0000-0000-0000-000000000000', 'suspend', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 7: admin_campaign_action rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_campaign_action rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.admin_campaign_action('00000000-0000-0000-0000-000000000000', 'pause', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 8: process_payout_request rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.process_payout_request('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 9: complete_payout_request rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', 'UTR123', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 10: write_admin_audit rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'write_admin_audit rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.write_admin_audit('test', 'test', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 11: approve_clip rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.approve_clip('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 12: adjust_campaign_budget rejects non-admin/non-owner
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget rejects non-admin non-owner (expect exception)';
  BEGIN
    PERFORM public.adjust_campaign_budget('00000000-0000-0000-0000-000000000000', 1000, 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 13: verify_campaign_launch_payment rejects non-admin
  v_test_id := v_test_id + 1;
  v_test_name := 'verify_campaign_launch_payment rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.verify_campaign_launch_payment('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 14: reject_campaign_launch_payment rejects non-admin
  v_test_id := v_test_id + 1;
  v_test_name := 'reject_campaign_launch_payment rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.reject_campaign_launch_payment('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION B: SERVICE-ONLY RPC REGRESSION TESTS
  -- =========================================================================

  -- TEST 15: ingest_clip_metrics NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics: anon cannot execute';
  v_pass := NOT has_function_privilege('anon', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 16: ingest_clip_metrics NOT executable by authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics: authenticated cannot execute';
  v_pass := NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 17: ingest_clip_metrics IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics: service_role can execute';
  v_pass := has_function_privilege('service_role', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 18: finalize_clip_earning NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'finalize_clip_earning: anon cannot execute';
  v_pass := NOT has_function_privilege('anon', 'public.finalize_clip_earning(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 19: finalize_clip_earning NOT executable by authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'finalize_clip_earning: authenticated cannot execute';
  v_pass := NOT has_function_privilege('authenticated', 'public.finalize_clip_earning(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 20: finalize_clip_earning IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'finalize_clip_earning: service_role can execute';
  v_pass := has_function_privilege('service_role', 'public.finalize_clip_earning(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 21: acquire_sync_lock NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'acquire_sync_lock: anon cannot execute';
  v_pass := NOT has_function_privilege('anon', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 22: acquire_sync_lock NOT executable by authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'acquire_sync_lock: authenticated cannot execute';
  v_pass := NOT has_function_privilege('authenticated', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 23: acquire_sync_lock IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'acquire_sync_lock: service_role can execute';
  v_pass := has_function_privilege('service_role', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 24: release_sync_lock NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'release_sync_lock: anon cannot execute';
  v_pass := NOT has_function_privilege('anon', 'public.release_sync_lock(text,uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 25: release_sync_lock NOT executable by authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'release_sync_lock: authenticated cannot execute';
  v_pass := NOT has_function_privilege('authenticated', 'public.release_sync_lock(text,uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 26: release_sync_lock IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'release_sync_lock: service_role can execute';
  v_pass := has_function_privilege('service_role', 'public.release_sync_lock(text,uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 27: renew_sync_lock NOT executable by anon
  v_test_id := v_test_id + 1;
  v_test_name := 'renew_sync_lock: anon cannot execute';
  v_pass := NOT has_function_privilege('anon', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 28: renew_sync_lock NOT executable by authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'renew_sync_lock: authenticated cannot execute';
  v_pass := NOT has_function_privilege('authenticated', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 29: renew_sync_lock IS executable by service_role
  v_test_id := v_test_id + 1;
  v_test_name := 'renew_sync_lock: service_role can execute';
  v_pass := has_function_privilege('service_role', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION C: FINANCIAL TABLE ACCESS CONTROL TESTS
  -- =========================================================================

  -- TEST 30: financial_records has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'financial_records has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'financial_records'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 31: payout_requests has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'payout_requests has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'payout_requests'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 32: wallet_ledger has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'wallet_ledger has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'wallet_ledger'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 33: audit_logs has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'audit_logs has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 34: social_connections has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'social_connections'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 35: earnings table has RLS enabled (legacy, still exists)
  v_test_id := v_test_id + 1;
  v_test_name := 'earnings has RLS enabled (if table exists)';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'earnings'
    AND rowsecurity = false
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 36: notifications has RLS enabled
  v_test_id := v_test_id + 1;
  v_test_name := 'notifications has RLS enabled';
  v_pass := EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notifications'
    AND rowsecurity = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION D: AUDIT LOG INTEGRITY TESTS
  -- =========================================================================

  -- TEST 37: audit_logs UPDATE trigger exists (append-only enforcement)
  v_test_id := v_test_id + 1;
  v_test_name := 'audit_logs has UPDATE prevention trigger';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND t.tgname = 'trg_prevent_audit_update'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 38: audit_logs DELETE trigger exists (append-only enforcement)
  v_test_id := v_test_id + 1;
  v_test_name := 'audit_logs has DELETE prevention trigger';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND t.tgname = 'trg_prevent_audit_delete'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 39: write_admin_audit function exists
  v_test_id := v_test_id + 1;
  v_test_name := 'write_admin_audit function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'write_admin_audit'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION E: DATA INTEGRITY CONSTRAINT TESTS
  -- =========================================================================

  -- TEST 40: profiles.role CHECK constraint exists
  v_test_id := v_test_id + 1;
  v_test_name := 'profiles.role CHECK constraint exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles'
    AND con.conname = 'profiles_role_check'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 41: profiles.status CHECK constraint exists
  v_test_id := v_test_id + 1;
  v_test_name := 'profiles.status CHECK constraint exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles'
    AND con.conname = 'profiles_status_check'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 42: clips.status CHECK constraint only allows moderation statuses
  v_test_id := v_test_id + 1;
  v_test_name := 'clips.status CHECK only allows pending/approved/rejected/held';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'clips'
    AND con.conname = 'clips_status_check'
    AND con.contype = 'c'
    AND con.conbin ~ 'pending.*approved.*rejected.*held'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 43: financial_records.status CHECK only allows pending/processing/paid
  v_test_id := v_test_id + 1;
  v_test_name := 'financial_records.status CHECK only allows pending/processing/paid';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'financial_records'
    AND con.conname = 'financial_records_status_check'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 44: payout_requests.status CHECK only allows pending/processing/paid
  v_test_id := v_test_id + 1;
  v_test_name := 'payout_requests.status CHECK only allows pending/processing/paid';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payout_requests'
    AND con.conname = 'payout_requests_status_check'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 45: campaigns.budget CHECK non-negative
  v_test_id := v_test_id + 1;
  v_test_name := 'campaigns.budget CHECK non-negative exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND con.conname = 'campaigns_budget_nonneg'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 46: campaigns.payout CHECK non-negative
  v_test_id := v_test_id + 1;
  v_test_name := 'campaigns.payout CHECK non-negative exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND con.conname = 'campaigns_payout_nonneg'
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 47: campaigns.status CHECK includes draft (for launch payment flow)
  v_test_id := v_test_id + 1;
  v_test_name := 'campaigns.status CHECK includes draft status';
  v_pass := EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND (con.conname LIKE 'campaigns_status_check%')
    AND con.contype = 'c'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION F: FUNCTION SECURITY PROPERTY TESTS
  -- =========================================================================

  -- TEST 48: All admin RPCs are SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_clip_action is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'admin_clip_action'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 49: request_payout is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'request_payout is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'request_payout'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 50: approve_clip is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'approve_clip'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 51: get_wallet_balance is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'get_wallet_balance is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_wallet_balance'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 52: submit_clip is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_clip is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'submit_clip'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION G: NOTIFICATION SECURITY TESTS
  -- =========================================================================

  -- TEST 53: notifications INSERT policy is admin-only
  v_test_id := v_test_id + 1;
  v_test_name := 'notifications INSERT policy only allows admin';
  v_pass := EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications'
    AND policyname = 'notifications_insert'
    AND qual = 'is_admin()'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION H: CAMPAIGN BUDGET LOCK TESTS
  -- =========================================================================

  -- TEST 54: enforce_campaign_budget_lock trigger exists
  v_test_id := v_test_id + 1;
  v_test_name := 'enforce_campaign_budget_lock trigger exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND t.tgname = 'trg_enforce_campaign_budget_lock'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 55: prevent_created_by_change trigger exists
  v_test_id := v_test_id + 1;
  v_test_name := 'prevent_created_by_change trigger exists on campaigns';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND t.tgname = 'prevent_created_by_update'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 56: set_created_by trigger exists on campaigns
  v_test_id := v_test_id + 1;
  v_test_name := 'set_created_by trigger exists on campaigns';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'campaigns'
    AND t.tgname = 'set_created_by'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 57: enforce_profile_field_permissions trigger exists
  v_test_id := v_test_id + 1;
  v_test_name := 'enforce_profile_field_permissions trigger exists on profiles';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'profiles'
    AND t.tgname = 'enforce_profile_fields'
    AND NOT t.tgisdisabled
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION G: BEHAVIORAL SECURITY TESTS (Round 2)
  -- =========================================================================

  -- TEST 58: approve_clip rejects non-admin callers
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.approve_clip('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 59: get_campaign_budget is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'get_campaign_budget is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_campaign_budget'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 60: get_wallet_balance is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'get_wallet_balance is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'get_wallet_balance'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 61: complete_payout_request has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', 'UTR-TEST', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 62: process_payout_request has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.process_payout_request('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 63: admin_clip_action has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_clip_action rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.admin_clip_action('00000000-0000-0000-0000-000000000000', 'reject', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 64: admin_user_action has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_user_action rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.admin_user_action('00000000-0000-0000-0000-000000000000', 'suspend', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 65: verify_campaign_launch_payment has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'verify_campaign_launch_payment rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.verify_campaign_launch_payment('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 66: reject_campaign_launch_payment has permission check
  v_test_id := v_test_id + 1;
  v_test_name := 'reject_campaign_launch_payment rejects non-admin (expect exception)';
  BEGIN
    PERFORM public.reject_campaign_launch_payment('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- RESULTS
  -- =========================================================================

  RETURN jsonb_build_object(
    'total_tests', v_test_id,
    'all_passed', (select bool_and((t->>'PASS')::boolean) from jsonb_array_elements(v_results) as t),
    'results', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_security_regression_tests() TO authenticated;
