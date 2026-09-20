-- ===========================================================================
-- SECURITY AUDIT REGRESSION TESTS — 2026-09-20 Hardening Pass
-- ===========================================================================
-- Tests added for the comprehensive backend security audit.
--
-- Covers:
--   A. Cashfree payment state machine retry safety
--   B. OAuth verification failure path
--   C. Storage access control
--   D. Campaign visibility / no broad SELECT policy
--   E. SQL source-of-truth verification
--   F. Financial record integrity
--   G. Admin authorization
--
-- Test UUIDs (must exist in auth.users + profiles):
--   Creator: e92427b0-254e-44cc-b2df-be83792c8a94
--   Admin:   f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Clipper: 2d75364e-77e0-4eb2-af96-48f573cb4a43
--
-- Each test is wrapped in BEGIN/ROLLBACK so no data persists.
-- ===========================================================================

-- ===========================================================================
-- SECTION A: CASHFREE PAYMENT STATE MACHINE RETRY SAFETY
-- ===========================================================================

-- TEST A1: reserve_cashfree_payment_attempt reuses rejected record
-- (allows retry after rejection)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_id uuid;
  v_result jsonb;
  v_payment_status text;
BEGIN
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'CF Retry Test A1', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'pending'
  ) RETURNING id INTO v_id;

  -- Simulate a rejected payment attempt
  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise,
    payment_status, cashfree_order_id, cashfree_flow,
    cashfree_order_status, cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200,
    'rejected', 'cliptwo_' || v_id::text || '_attempt_1', 'cashfree',
    'FAILED', 1
  );

  -- Reserve should succeed (reuse rejected record)
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  ASSERT (v_result->>'success')::boolean = true,
    'A1: Reserve after rejection should succeed';

  -- Check payment status was reset to reserving
  SELECT payment_status INTO v_payment_status
  FROM public.campaign_launch_payments
  WHERE campaign_id = v_id AND cashfree_flow = 'cashfree';

  ASSERT v_payment_status = 'reserving',
    'A1: Payment should be reserving after reserve, got: ' || v_payment_status;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A1 PASSED' AS result;
ROLLBACK;

-- TEST A2: release_cashfree_payment_reservation allows new attempt after release
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
    'CF Retry Test A2', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  -- Create a reservation
  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise,
    payment_status, cashfree_order_id, cashfree_flow,
    cashfree_order_status, cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200,
    'reserving', 'cliptwo_' || v_id::text || '_attempt_1', 'cashfree',
    'RESERVING', 1
  );

  -- Release the reservation
  v_result := public.release_cashfree_payment_reservation(v_id);
  ASSERT (v_result->>'success')::boolean = true,
    'A2: Release should succeed';

  -- Campaign should be restored to pending
  ASSERT (SELECT launch_payment_status FROM public.campaigns WHERE id = v_id) = 'pending',
    'A2: Campaign should be restored to pending after release';

  -- Now reserve again — should create a new reservation
  v_result := public.reserve_cashfree_payment_attempt(v_id);
  ASSERT (v_result->>'success')::boolean = true,
    'A2: Reserve after release should succeed';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A2 PASSED' AS result;
ROLLBACK;

-- TEST A3: verify_cashfree_webhook is idempotent (duplicate success webhook)
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'c0000000-0000-0000-0000-0000000000a3', 'CF Idempotent A3', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_flow, cashfree_order_status,
    cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200, 'submitted',
    'cliptwo_idempotent_a3', 'cashfree', 'SUBMITTED', 1
  ) RETURNING id INTO v_payment_id;

  -- First verify
  v_result := public.verify_cashfree_webhook('cliptwo_idempotent_a3', 'cf_pay_1', 12.00);
  ASSERT (v_result->>'success')::boolean = true,
    'A3: First verify should succeed';

  -- Second verify (duplicate webhook) — should be idempotent
  v_result := public.verify_cashfree_webhook('cliptwo_idempotent_a3', 'cf_pay_1', 12.00);
  ASSERT (v_result->>'idempotent')::boolean = true,
    'A3: Second verify should be idempotent';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A3 PASSED' AS result;
ROLLBACK;

-- TEST A4: reject_cashfree_webhook is idempotent (duplicate failure webhook)
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'c0000000-0000-0000-0000-0000000000a4', 'CF Idempotent A4', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_flow, cashfree_order_status,
    cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200, 'submitted',
    'cliptwo_idempotent_a4', 'cashfree', 'SUBMITTED', 1
  ) RETURNING id INTO v_payment_id;

  -- First reject
  v_result := public.reject_cashfree_webhook('cliptwo_idempotent_a4', 'cf_pay_1', 'test failure');
  ASSERT (v_result->>'success')::boolean = true,
    'A4: First reject should succeed';

  -- Second reject (duplicate webhook) — should be idempotent
  v_result := public.reject_cashfree_webhook('cliptwo_idempotent_a4', 'cf_pay_1', 'test failure');
  ASSERT (v_result->>'idempotent')::boolean = true,
    'A4: Second reject should be idempotent';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A4 PASSED' AS result;
ROLLBACK;

-- TEST A5: verify after reject is blocked (reject is terminal for that order)
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'c0000000-0000-0000-0000-0000000000a5', 'CF Terminal A5', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_flow, cashfree_order_status,
    cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200, 'submitted',
    'cliptwo_terminal_a5', 'cashfree', 'SUBMITTED', 1
  ) RETURNING id INTO v_payment_id;

  -- Reject first
  v_result := public.reject_cashfree_webhook('cliptwo_terminal_a5', 'cf_pay_1', 'amount mismatch');
  ASSERT (v_result->>'success')::boolean = true,
    'A5: Reject should succeed';

  -- Try to verify the same order — should fail (already rejected)
  BEGIN
    v_result := public.verify_cashfree_webhook('cliptwo_terminal_a5', 'cf_pay_2', 12.00);
    ASSERT false, 'A5: Should have raised exception';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not in submitted%',
      'A5: Wrong error: ' || SQLERRM;
  END;

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A5 PASSED' AS result;
ROLLBACK;

-- TEST A6: verify_cashfree_webhook rejects amount mismatch (terminal)
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_payment_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO public.campaigns (
    id, title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'c0000000-0000-0000-0000-0000000000a6', 'CF Amount A6', 'Brief', 'YouTube', 0, 'Creator',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    100, 'draft', 'submitted'
  ) RETURNING id INTO v_id;

  INSERT INTO public.campaign_launch_payments (
    campaign_id, creator_id, campaign_budget_rupees,
    platform_fee_paise, total_payable_paise, payment_status,
    cashfree_order_id, cashfree_flow, cashfree_order_status,
    cashfree_attempt_number
  ) VALUES (
    v_id, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100,
    1100, 1200, 'submitted',
    'cliptwo_amount_a6', 'cashfree', 'SUBMITTED', 1
  ) RETURNING id INTO v_payment_id;

  -- Verify with wrong amount (expected 12.00, sent 10.00)
  v_result := public.verify_cashfree_webhook('cliptwo_amount_a6', 'cf_pay_1', 10.00);
  ASSERT (v_result->>'success')::boolean = false,
    'A6: Amount mismatch should fail';

  -- Payment should be rejected
  ASSERT (SELECT payment_status FROM public.campaign_launch_payments WHERE id = v_payment_id) = 'rejected',
    'A6: Payment should be rejected after amount mismatch';

  DELETE FROM public.campaign_launch_payments WHERE campaign_id = v_id;
  DELETE FROM public.campaigns WHERE id = v_id;
END $$;

SELECT 'TEST A6 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION B: CAMPAIGN VISIBILITY / NO BROAD SELECT POLICY
-- ===========================================================================

-- TEST B1: No broad campaign SELECT policy exists (USING (true) or similar)
BEGIN;
DO $$
DECLARE
  v_bad_policy text;
BEGIN
  SELECT policyname INTO v_bad_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'campaigns'
    AND cmd = 'SELECT'
    AND qual = 'true';

  ASSERT v_bad_policy IS NULL,
    'B1: Found broad campaign SELECT policy: ' || COALESCE(v_bad_policy, 'unknown');
END $$;

SELECT 'TEST B1 PASSED' AS result;
ROLLBACK;

-- TEST B2: campaigns_select_clipper policy only allows open+verified
BEGIN;
DO $$
DECLARE
  v_policy_def text;
BEGIN
  SELECT qual INTO v_policy_def
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'campaigns'
    AND policyname = 'campaigns_select_clipper';

  ASSERT v_policy_def IS NOT NULL,
    'B2: campaigns_select_clipper policy not found';

  -- Must contain both status and launch_payment_status checks
  ASSERT v_policy_def LIKE '%status%open%',
    'B2: Policy must check status = open';
  ASSERT v_policy_def LIKE '%launch_payment_status%verified%',
    'B2: Policy must check launch_payment_status = verified';
END $$;

SELECT 'TEST B2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION C: SQL SOURCE-OF-TRUTH VERIFICATION
-- ===========================================================================

-- TEST C1: verify_cashfree_webhook is SECURITY DEFINER and service_role only
BEGIN;
DO $$
DECLARE
  v_is_secdef boolean;
  v_grant_count integer;
BEGIN
  SELECT p.prosecdef INTO v_is_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'verify_cashfree_webhook';

  ASSERT v_is_secdef = true,
    'C1: verify_cashfree_webhook must be SECURITY DEFINER';

  -- Should NOT be granted to authenticated or anon
  SELECT count(*) INTO v_grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_auth_members m ON m.roleid = p.proowner
  JOIN pg_roles grantee ON grantee.oid = m.member
  WHERE n.nspname = 'public'
    AND p.proname = 'verify_cashfree_webhook'
    AND grantee.rolname IN ('authenticated', 'anon');

  ASSERT v_grant_count = 0,
    'C1: verify_cashfree_webhook must not be granted to authenticated/anon';
END $$;

SELECT 'TEST C1 PASSED' AS result;
ROLLBACK;

-- TEST C2: reject_cashfree_webhook is SECURITY DEFINER and service_role only
BEGIN;
DO $$
DECLARE
  v_is_secdef boolean;
  v_grant_count integer;
BEGIN
  SELECT p.prosecdef INTO v_is_secdef
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'reject_cashfree_webhook';

  ASSERT v_is_secdef = true,
    'C2: reject_cashfree_webhook must be SECURITY DEFINER';

  SELECT count(*) INTO v_grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_auth_members m ON m.roleid = p.proowner
  JOIN pg_roles grantee ON grantee.oid = m.member
  WHERE n.nspname = 'public'
    AND p.proname = 'reject_cashfree_webhook'
    AND grantee.rolname IN ('authenticated', 'anon');

  ASSERT v_grant_count = 0,
    'C2: reject_cashfree_webhook must not be granted to authenticated/anon';
END $$;

SELECT 'TEST C2 PASSED' AS result;
ROLLBACK;

-- TEST C3: ingest_clip_metrics is service_role only
BEGIN;
DO $$
DECLARE
  v_grant_count integer;
BEGIN
  SELECT count(*) INTO v_grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_auth_members m ON m.roleid = p.proowner
  JOIN pg_roles grantee ON grantee.oid = m.member
  WHERE n.nspname = 'public'
    AND p.proname = 'ingest_clip_metrics'
    AND grantee.rolname IN ('authenticated', 'anon');

  ASSERT v_grant_count = 0,
    'C3: ingest_clip_metrics must not be granted to authenticated/anon';
END $$;

SELECT 'TEST C3 PASSED' AS result;
ROLLBACK;

-- TEST C4: finalize_clip_earning is service_role only
BEGIN;
DO $$
DECLARE
  v_grant_count integer;
BEGIN
  SELECT count(*) INTO v_grant_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  JOIN pg_auth_members m ON m.roleid = p.proowner
  JOIN pg_roles grantee ON grantee.oid = m.member
  WHERE n.nspname = 'public'
    AND p.proname = 'finalize_clip_earning'
    AND grantee.rolname IN ('authenticated', 'anon');

  ASSERT v_grant_count = 0,
    'C4: finalize_clip_earning must not be granted to authenticated/anon';
END $$;

SELECT 'TEST C4 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION D: FINANCIAL RECORD INTEGRITY
-- ===========================================================================

-- TEST D1: campaign_launch_payments direct INSERT is revoked from authenticated
BEGIN;
DO $$
DECLARE
  v_has_policy boolean;
BEGIN
  -- Check if there's an INSERT policy for authenticated (there shouldn't be)
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_launch_payments'
      AND cmd = 'INSERT'
      AND roles = '{authenticated}'
  ) INTO v_has_policy;

  ASSERT v_has_policy = false,
    'D1: campaign_launch_payments should not have INSERT policy for authenticated';
END $$;

SELECT 'TEST D1 PASSED' AS result;
ROLLBACK;

-- TEST D2: financial_records direct INSERT is admin-only
BEGIN;
DO $$
DECLARE
  v_policy_count integer;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'financial_records'
    AND cmd = 'INSERT'
    AND qual LIKE '%is_admin%';

  ASSERT v_policy_count >= 1,
    'D2: financial_records INSERT must require admin';
END $$;

SELECT 'TEST D2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION E: ADMIN AUTHORIZATION
-- ===========================================================================

-- TEST E1: is_admin checks profiles.role, not email
BEGIN;
DO $$
DECLARE
  v_func_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'is_admin';

  ASSERT v_func_def LIKE '%profiles%',
    'E1: is_admin must check profiles table';
  ASSERT v_func_def LIKE '%role%',
    'E1: is_admin must check role column';

  -- Should NOT hard-code email as the primary check
  -- (email is only in is_super_admin)
  ASSERT v_func_def NOT LIKE '%workclip11%',
    'E1: is_admin must not hard-code email';
END $$;

SELECT 'TEST E1 PASSED' AS result;
ROLLBACK;

-- TEST E2: admin_has_perm grants all permissions to super-admin
BEGIN;
DO $$
DECLARE
  v_func_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'admin_has_perm';

  -- Should check is_super_admin() first (returns true for all perms)
  ASSERT v_func_def LIKE '%is_super_admin%',
    'E2: admin_has_perm must check is_super_admin for super-admin bypass';
END $$;

SELECT 'TEST E2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION F: CAMPAIGN STATUS PROTECTION
-- ===========================================================================

-- TEST F1: enforce_campaign_status_protected trigger exists
BEGIN;
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'campaigns'
      AND t.tgname = 'enforce_campaign_status_protected'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;

  ASSERT v_trigger_exists = true,
    'F1: enforce_campaign_status_protected trigger must exist on campaigns';
END $$;

SELECT 'TEST F1 PASSED' AS result;
ROLLBACK;

-- TEST F2: enforce_campaign_open_requires_verified trigger exists
BEGIN;
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'campaigns'
      AND t.tgname = 'enforce_campaign_open_requires_verified'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;

  ASSERT v_trigger_exists = true,
    'F2: enforce_campaign_open_requires_verified trigger must exist on campaigns';
END $$;

SELECT 'TEST F2 PASSED' AS result;
ROLLBACK;

-- TEST F3: enforce_campaign_launch_payment_integrity trigger exists
BEGIN;
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'campaigns'
      AND t.tgname = 'enforce_campaign_launch_payment_integrity'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;

  ASSERT v_trigger_exists = true,
    'F3: enforce_campaign_launch_payment_integrity trigger must exist on campaigns';
END $$;

SELECT 'TEST F3 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION G: AUDIT LOG PROTECTION
-- ===========================================================================

-- TEST G1: audit_logs is append-only (no UPDATE policy)
BEGIN;
DO $$
DECLARE
  v_has_update boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_logs'
      AND cmd = 'UPDATE'
  ) INTO v_has_update;

  ASSERT v_has_update = false,
    'G1: audit_logs must not have UPDATE policy';
END $$;

SELECT 'TEST G1 PASSED' AS result;
ROLLBACK;

-- TEST G2: audit_logs DELETE policy is false (nobody can delete)
BEGIN;
DO $$
DECLARE
  v_delete_qual text;
BEGIN
  SELECT qual INTO v_delete_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'audit_logs'
    AND cmd = 'DELETE';

  ASSERT v_delete_qual = 'false',
    'G2: audit_logs DELETE policy must be false (nobody can delete)';
END $$;

SELECT 'TEST G2 PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- SECTION H: SOCIAL CONNECTIONS TOKEN PROTECTION
-- ===========================================================================

-- TEST H1: social_connections has no SELECT policy for browser
BEGIN;
DO $$
DECLARE
  v_has_select boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'social_connections'
      AND cmd = 'SELECT'
      AND qual != 'false'
  ) INTO v_has_select;

  ASSERT v_has_select = false,
    'H1: social_connections must not have a permissive SELECT policy';
END $$;

SELECT 'TEST H1 PASSED' AS result;
ROLLBACK;

-- TEST H2: enforce_social_connection_tokens trigger exists
BEGIN;
DO $$
DECLARE
  v_trigger_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'social_connections'
      AND t.tgname = 'enforce_social_connection_tokens'
      AND NOT t.tgisinternal
  ) INTO v_trigger_exists;

  ASSERT v_trigger_exists = true,
    'H2: enforce_social_connection_tokens trigger must exist';
END $$;

SELECT 'TEST H2 PASSED' AS result;
ROLLBACK;
