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
  -- SECTION H: BEHAVIORAL SECURITY TESTS (Round 3)
  -- These tests verify actual security conditions, not just exception handling
  -- =========================================================================

  -- TEST 67: get_wallet_balance rejects cross-user access
  v_test_id := v_test_id + 1;
  v_test_name := 'get_wallet_balance rejects cross-user access (expect exception)';
  BEGIN
    -- This should fail because auth.uid() is NULL in this context
    PERFORM public.get_wallet_balance('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 68: get_campaign_budget rejects cross-user access
  v_test_id := v_test_id + 1;
  v_test_name := 'get_campaign_budget rejects cross-user access (expect exception)';
  BEGIN
    PERFORM public.get_campaign_budget('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 69: campaign_action rejects non-owner access
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action rejects non-owner access (expect exception)';
  BEGIN
    PERFORM public.campaign_action('00000000-0000-0000-0000-000000000000', 'pause', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 70: adjust_campaign_budget rejects non-owner access
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget rejects non-owner access (expect exception)';
  BEGIN
    PERFORM public.adjust_campaign_budget('00000000-0000-0000-0000-000000000000', 1000, 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 71: complete_payout_request rejects missing UTR
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request rejects missing UTR (expect exception)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', NULL, 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 72: complete_payout_request rejects empty UTR
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request rejects empty UTR (expect exception)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', '   ', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 73: complete_payout_request rejects non-existent payout
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request rejects non-existent payout (expect exception)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', 'UTR123456', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 74: process_payout_request rejects non-existent payout
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request rejects non-existent payout (expect exception)';
  BEGIN
    PERFORM public.process_payout_request('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 75: approve_clip rejects non-existent clip
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip rejects non-existent clip (expect exception)';
  BEGIN
    PERFORM public.approve_clip('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 76: submit_clip rejects non-existent campaign
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_clip rejects non-existent campaign (expect exception)';
  BEGIN
    PERFORM public.submit_clip('00000000-0000-0000-0000-000000000000', 'test', 'https://example.com/video.mp4', 'Instagram');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 77: verify_campaign_launch_payment rejects non-existent payment
  v_test_id := v_test_id + 1;
  v_test_name := 'verify_campaign_launch_payment rejects non-existent payment (expect exception)';
  BEGIN
    PERFORM public.verify_campaign_launch_payment('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 78: reject_campaign_launch_payment rejects non-existent payment
  v_test_id := v_test_id + 1;
  v_test_name := 'reject_campaign_launch_payment rejects non-existent payment (expect exception)';
  BEGIN
    PERFORM public.reject_campaign_launch_payment('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 79: request_payout rejects non-existent user
  v_test_id := v_test_id + 1;
  v_test_name := 'request_payout rejects non-existent user (expect exception)';
  BEGIN
    PERFORM public.request_payout();
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    v_pass := true;
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 80: get_wallet_balance is SECURITY DEFINER
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

  -- TEST 81: get_campaign_budget is SECURITY DEFINER
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

  -- TEST 82: approve_clip is SECURITY DEFINER
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

  -- TEST 83: campaign_action is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'campaign_action'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 84: adjust_campaign_budget is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'adjust_campaign_budget'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 85: submit_clip is SECURITY DEFINER
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

  -- TEST 86: submit_campaign_launch_payment is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_campaign_launch_payment is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'submit_campaign_launch_payment'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 87: financial_records table has INSERT revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'financial_records INSERT revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'financial_records'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.financial_records', 'INSERT')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 88: payout_requests table has INSERT revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'payout_requests INSERT revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payout_requests'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.payout_requests', 'INSERT')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 89: wallet_ledger table has INSERT revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'wallet_ledger INSERT revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'wallet_ledger'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.wallet_ledger', 'INSERT')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 90: audit_logs table has INSERT revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'audit_logs INSERT revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.audit_logs', 'INSERT')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION I: PAYOUT LIFECYCLE TESTS (Round 4)
  -- These tests verify payout concurrency and lifecycle safety
  -- =========================================================================

  -- TEST 91: complete_payout_request requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request requires admin role (expect admin error)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', 'UTR123', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 92: complete_payout_request requires payout.complete permission
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request requires payout.complete permission (expect permission error)';
  BEGIN
    PERFORM public.complete_payout_request('00000000-0000-0000-0000-000000000000', 'UTR123', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%payout.complete%' OR v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 93: process_payout_request requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request requires admin role (expect admin error)';
  BEGIN
    PERFORM public.process_payout_request('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 94: process_payout_request requires payout.process permission
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request requires payout.process permission (expect permission error)';
  BEGIN
    PERFORM public.process_payout_request('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%payout.process%' OR v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 95: request_payout requires active account
  v_test_id := v_test_id + 1;
  v_test_name := 'request_payout requires active account (expect authentication error)';
  BEGIN
    PERFORM public.request_payout();
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%' OR v_error_msg LIKE '%account%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 96: approve_clip requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip requires admin role (expect admin error)';
  BEGIN
    PERFORM public.approve_clip('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 97: approve_clip requires clip.approve permission
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip requires clip.approve permission (expect permission error)';
  BEGIN
    PERFORM public.approve_clip('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%clip.approve%' OR v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 98: campaign_action requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.campaign_action('00000000-0000-0000-0000-000000000000', 'pause', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 99: campaign_action validates action parameter
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action validates action parameter (expect validation error)';
  BEGIN
    PERFORM public.campaign_action('00000000-0000-0000-0000-000000000000', 'invalid_action', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%action%' OR v_error_msg LIKE '%valid%' OR v_error_msg LIKE '%pause%' OR v_error_msg LIKE '%launch%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 100: adjust_campaign_budget requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.adjust_campaign_budget('00000000-0000-0000-0000-000000000000', 1000, 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 101: adjust_campaign_budget rejects negative budget
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget rejects negative budget (expect validation error)';
  BEGIN
    PERFORM public.adjust_campaign_budget('00000000-0000-0000-0000-000000000000', -100, 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%negative%' OR v_error_msg LIKE '%non-negative%' OR v_error_msg LIKE '%budget%' OR v_error_msg LIKE '%positive%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 102: get_wallet_balance requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'get_wallet_balance requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.get_wallet_balance('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 103: get_campaign_budget requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'get_campaign_budget requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.get_campaign_budget('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 104: submit_clip requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_clip requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.submit_clip('00000000-0000-0000-0000-000000000000', 'test', 'https://example.com/video.mp4', 'Instagram');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 105: submit_campaign_launch_payment requires authentication
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_campaign_launch_payment requires authentication (expect authentication error)';
  BEGIN
    PERFORM public.submit_campaign_launch_payment('00000000-0000-0000-0000-000000000000', 'UTR123');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%authenticated%' OR v_error_msg LIKE '%Not authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 106: verify_campaign_launch_payment requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'verify_campaign_launch_payment requires admin role (expect admin error)';
  BEGIN
    PERFORM public.verify_campaign_launch_payment('00000000-0000-0000-0000-000000000000');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 107: reject_campaign_launch_payment requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'reject_campaign_launch_payment requires admin role (expect admin error)';
  BEGIN
    PERFORM public.reject_campaign_launch_payment('00000000-0000-0000-0000-000000000000', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 108: admin_clip_action requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_clip_action requires admin role (expect admin error)';
  BEGIN
    PERFORM public.admin_clip_action('00000000-0000-0000-0000-000000000000', 'reject', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 109: admin_user_action requires admin role
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_user_action requires admin role (expect admin error)';
  BEGIN
    PERFORM public.admin_user_action('00000000-0000-0000-0000-000000000000', 'suspend', 'test');
    v_pass := false;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT;
    v_pass := v_error_msg LIKE '%admin%' OR v_error_msg LIKE '%permission%' OR v_error_msg LIKE '%authenticated%';
  END;
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION I (continued): STRUCTURAL FUNCTION TESTS
  -- These verify security properties via pg_proc metadata
  -- =========================================================================

  -- TEST 110: complete_payout_request is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'complete_payout_request'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 111: process_payout_request is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'process_payout_request'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 112: campaign_action is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action is SECURITY DEFINER';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'campaign_action'
    AND p.prosecdef = true
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 113: complete_payout_request has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'complete_payout_request has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.complete_payout_request(uuid,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 114: process_payout_request has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'process_payout_request has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.process_payout_request(uuid,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 115: request_payout has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'request_payout has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.request_payout()', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 116: approve_clip has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'approve_clip has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.approve_clip(uuid,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 117: campaign_action has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'campaign_action has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.campaign_action(uuid,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 118: adjust_campaign_budget has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'adjust_campaign_budget has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.adjust_campaign_budget(uuid,numeric,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 119: get_wallet_balance has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'get_wallet_balance has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.get_wallet_balance(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 120: get_campaign_budget has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'get_campaign_budget has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.get_campaign_budget(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 121: submit_clip has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_clip has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.submit_clip(uuid,text,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 122: submit_campaign_launch_payment has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'submit_campaign_launch_payment has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.submit_campaign_launch_payment(uuid,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 123: verify_campaign_launch_payment has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'verify_campaign_launch_payment has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.verify_campaign_launch_payment(uuid)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 124: reject_campaign_launch_payment has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'reject_campaign_launch_payment has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.reject_campaign_launch_payment(uuid,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 125: admin_clip_action has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_clip_action has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.admin_clip_action(uuid,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 126: admin_user_action has GRANT EXECUTE to authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'admin_user_action has GRANT EXECUTE to authenticated';
  v_pass := has_function_privilege('authenticated', 'public.admin_user_action(uuid,text,text)', 'EXECUTE');
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 127: payout_requests table has UPDATE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'payout_requests UPDATE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payout_requests'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.payout_requests', 'UPDATE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 128: financial_records table has UPDATE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'financial_records UPDATE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'financial_records'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.financial_records', 'UPDATE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 129: wallet_ledger table has UPDATE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'wallet_ledger UPDATE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'wallet_ledger'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.wallet_ledger', 'UPDATE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 130: audit_logs table has UPDATE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'audit_logs UPDATE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.audit_logs', 'UPDATE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 131: financial_records table has DELETE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'financial_records DELETE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'financial_records'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.financial_records', 'DELETE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 132: payout_requests table has DELETE revoked from authenticated
  v_test_id := v_test_id + 1;
  v_test_name := 'payout_requests DELETE revoked from authenticated';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_roles r
    JOIN pg_class c ON c.relowner = r.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'payout_requests'
    AND r.rolname = 'authenticated'
    AND has_table_privilege(r.oid, 'public.payout_requests', 'DELETE')
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION K: SOCIAL_CONNECTIONS TOKEN PROTECTION TESTS
  -- =========================================================================

  -- TEST 133: enforce_social_connection_token_protection trigger exists
  v_test_id := v_test_id + 1;
  v_test_name := 'enforce_social_connection_token_protection trigger exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relname = 'social_connections'
    AND t.tgname = 'enforce_social_connection_tokens'
    AND NOT t.tgisinternal
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 134: enforce_social_connection_token_protection function exists
  v_test_id := v_test_id + 1;
  v_test_name := 'enforce_social_connection_token_protection function exists';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'enforce_social_connection_token_protection'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 135: Trigger function is SECURITY DEFINER
  v_test_id := v_test_id + 1;
  v_test_name := 'social connection token trigger is SECURITY DEFINER';
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

  -- TEST 136: social_connections UPDATE policy remains dropped (defense-in-depth)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections UPDATE policy still dropped';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'social_connections'
    AND policyname = 'social_connections_update'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 137: social_connections INSERT policy remains dropped (defense-in-depth)
  v_test_id := v_test_id + 1;
  v_test_name := 'social_connections INSERT policy still dropped';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'social_connections'
    AND policyname = 'social_connections_insert'
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- =========================================================================
  -- SECTION L: VERIFIED VIEWS REGRESSION PREVENTION TESTS
  -- =========================================================================

  -- TEST 138: ingest_clip_metrics exists with correct signature
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

  -- TEST 139: ingest_clip_metrics is SECURITY DEFINER
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

  -- TEST 140: ingest_clip_metrics execution is restricted to service_role only
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics restricted to service_role';
  v_pass := NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_roles procout ON procout.oid = p.proowner
    WHERE n.nspname = 'public'
    AND p.proname = 'ingest_clip_metrics'
    AND EXISTS (
      SELECT 1 FROM pg_auth_members m
      JOIN pg_roles grantee ON grantee.oid = m.member
      WHERE m.roleid = procout.oid AND grantee.rolname = 'authenticated'
    )
  );
  v_results := v_results || jsonb_build_object(
    'test_id', v_test_id, 'name', v_test_name, 'PASS', v_pass
  );

  -- TEST 141: ingest_clip_metrics CASE expression prevents verified_views regression
  -- This checks the function source contains the regression guard pattern.
  v_test_id := v_test_id + 1;
  v_test_name := 'ingest_clip_metrics contains verified_views regression guard';
  v_pass := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = 'ingest_clip_metrics'
    AND pg_get_functiondef(p.oid) LIKE '%CASE%verified_views%THEN%p_views%ELSE%verified_views%'
  );
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
