-- ===========================================================================
-- PAYOUT TEST SANDBOX
--
-- Completely isolated test environment for testing the payout workflow.
-- This migration creates SEPARATE test-only tables that must NEVER be
-- joined into or confused with production financial_records/payout_requests.
--
-- PRODUCTION ISOLATION GUARANTEE:
-- - This file does NOT modify financial_records
-- - This file does NOT modify payout_requests
-- - This file does NOT modify clips, campaigns, or users
-- - This file does NOT modify any production RPC functions
-- - Test tables use distinct naming (payout_test_*) to prevent confusion
-- - Test UTR must begin with "TEST-" prefix
-- - RLS restricts access to admins only
-- ===========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Create test sandbox balance table
-- Stores virtual sandbox balances for admin testing.
-- NEVER joined into production balance calculations.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_test_balances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_paise       integer NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_user_id)
);

ALTER TABLE public.payout_test_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_test_balances_admin_only" ON public.payout_test_balances;
CREATE POLICY "payout_test_balances_admin_only" ON public.payout_test_balances
  FOR ALL USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create test payout requests table
-- Mirrors production payout_requests structure for testing.
-- Uses "payout_test_" prefix to prevent confusion with production tables.
-- Status: pending → processing → paid (same as production)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_test_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_paise        integer NOT NULL CHECK (amount_paise > 0),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid')),
  upi_id              text NOT NULL DEFAULT 'test-user@upi',
  payment_reference   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  processing_at       timestamptz,
  paid_at             timestamptz,
  audit               jsonb
);

ALTER TABLE public.payout_test_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_test_requests_admin_only" ON public.payout_test_requests;
CREATE POLICY "payout_test_requests_admin_only" ON public.payout_test_requests
  FOR ALL USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Create test sandbox balance
-- Gives the admin a virtual ₹1,000 sandbox balance.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_seed_balance(
  p_balance_paise integer DEFAULT 100000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  v_admin_id := auth.uid();

  INSERT INTO public.payout_test_balances (admin_user_id, balance_paise)
  VALUES (v_admin_id, p_balance_paise)
  ON CONFLICT (admin_user_id) DO UPDATE
    SET balance_paise = p_balance_paise,
        updated_at = now()
  RETURNING to_jsonb(payout_test_balances.*) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_seed_balance(integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Get test sandbox balance
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_get_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_balance record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  v_admin_id := auth.uid();

  SELECT * INTO v_balance
  FROM public.payout_test_balances
  WHERE admin_user_id = v_admin_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'balance_paise', 0,
      'has_balance', false
    );
  END IF;

  RETURN jsonb_build_object(
    'balance_paise', v_balance.balance_paise,
    'has_balance', true,
    'id', v_balance.id,
    'updated_at', v_balance.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_get_balance() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Create test payout request
-- Deducts from sandbox balance and creates a pending test payout.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_create_request(
  p_amount_paise integer,
  p_upi_id text DEFAULT 'test-user@upi'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_balance integer;
  v_request record;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  v_admin_id := auth.uid();

  -- Get current sandbox balance
  SELECT balance_paise INTO v_balance
  FROM public.payout_test_balances
  WHERE admin_user_id = v_admin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No test sandbox balance found. Seed a balance first.';
  END IF;

  -- Validate amount
  IF p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Test payout amount must be positive';
  END IF;

  IF p_amount_paise > v_balance THEN
    RAISE EXCEPTION 'Test payout amount (₹%) exceeds sandbox balance (₹%)', p_amount_paise / 100, v_balance / 100;
  END IF;

  -- Deduct from sandbox balance
  UPDATE public.payout_test_balances
  SET balance_paise = balance_paise - p_amount_paise,
      updated_at = now()
  WHERE admin_user_id = v_admin_id;

  -- Create test payout request
  INSERT INTO public.payout_test_requests (
    admin_user_id, amount_paise, status, upi_id, audit
  ) VALUES (
    v_admin_id, p_amount_paise, 'pending', p_upi_id,
    jsonb_build_object(
      'action', 'test_created',
      'by', (SELECT email FROM public.profiles WHERE id = v_admin_id),
      'at', now()
    )
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_create_request(integer, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: Process test payout request (pending → processing)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_process_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  UPDATE public.payout_test_requests SET
    status = 'processing',
    processing_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'test_processing',
      'by', (SELECT email FROM public.profiles WHERE id = auth.uid()),
      'at', now()
    )
  WHERE id = p_request_id AND status = 'pending'
    AND admin_user_id = auth.uid()
  RETURNING * INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Test payout request not found or not in pending status';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_process_request(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: Complete test payout request (processing → paid)
-- Requires UTR starting with "TEST-" prefix.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_complete_request(
  p_request_id uuid,
  p_payment_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  -- Validate UTR format: must start with "TEST-"
  IF p_payment_reference IS NULL OR trim(p_payment_reference) = '' THEN
    RAISE EXCEPTION 'Test UTR is required. Format: TEST-XXXXXXXX';
  END IF;

  IF NOT trim(p_payment_reference) LIKE 'TEST-%' THEN
    RAISE EXCEPTION 'Test UTR must begin with "TEST-" prefix. Got: %', p_payment_reference;
  END IF;

  UPDATE public.payout_test_requests SET
    status = 'paid',
    payment_reference = trim(p_payment_reference),
    paid_at = now(),
    audit = coalesce(audit, '[]'::jsonb) || jsonb_build_object(
      'action', 'test_paid',
      'by', (SELECT email FROM public.profiles WHERE id = auth.uid()),
      'at', now(),
      'payment_reference', trim(p_payment_reference)
    )
  WHERE id = p_request_id AND status = 'processing'
    AND admin_user_id = auth.uid()
  RETURNING * INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Test payout request not found or not in processing status';
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_complete_request(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8: Get all test payout requests (admin view)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_get_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  SELECT coalesce(jsonb_agg(r.*), '[]'::jsonb) INTO v_result
  FROM (
    SELECT * FROM public.payout_test_requests
    WHERE admin_user_id = auth.uid()
      AND (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_get_requests(text, integer, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9: Reset test sandbox data
-- Deletes ONLY test sandbox rows for the current admin.
-- NEVER touches production tables.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payout_test_reset()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_requests_deleted integer;
  v_balance_reset boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can access the payout test sandbox';
  END IF;

  v_admin_id := auth.uid();

  -- Delete ONLY test payout requests belonging to this admin
  DELETE FROM public.payout_test_requests
  WHERE admin_user_id = v_admin_id;

  GET DIAGNOSTICS v_requests_deleted = ROW_COUNT;

  -- Reset sandbox balance to 0 (or delete the row)
  DELETE FROM public.payout_test_balances
  WHERE admin_user_id = v_admin_id;

  v_balance_reset := true;

  -- SAFETY PROOF: These queries return 0 rows affected because we never
  -- touch production tables. This function only operates on:
  --   payout_test_requests (test table)
  --   payout_test_balances (test table)

  RETURN jsonb_build_object(
    'success', true,
    'requests_deleted', v_requests_deleted,
    'balance_reset', v_balance_reset,
    'message', 'Test sandbox data has been reset. No production data was affected.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.payout_test_reset() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
--
-- Test sandbox tables created:
--   payout_test_balances — virtual sandbox balances (admin-only)
--   payout_test_requests — test payout requests (admin-only)
--
-- Test sandbox functions created:
--   payout_test_seed_balance(p_balance_paise) — create/reset sandbox balance
--   payout_test_get_balance() — read current sandbox balance
--   payout_test_create_request(p_amount_paise, p_upi_id) — create test payout
--   payout_test_process_request(p_request_id) — pending → processing
--   payout_test_complete_request(p_request_id, p_payment_reference) — processing → paid (requires TEST- UTR)
--   payout_test_get_requests(p_status, p_limit, p_offset) — list test payouts
--   payout_test_reset() — delete all test data for current admin
--
-- PRODUCTION ISOLATION:
--   These tables are NEVER joined into production balance calculations.
--   These functions NEVER modify financial_records, payout_requests, clips, or campaigns.
--   RLS restricts all access to admin users only.
-- ===========================================================================
