-- ===========================================================================
-- SECURITY HARDENING MIGRATION
--
-- Run AFTER: schema.sql, admin-schema.sql, financial-rewrite.sql,
--            finance-consolidation.sql, integrity-constraints.sql
--
-- Run BEFORE: rls-tests.sql
--
-- Fixes:
-- 1. Read RPCs: add auth.uid() ownership checks (IDOR fixes)
-- 2. Notifications: restrict INSERT to admin-only (prevent notification forgery)
-- 3. Payouts: remove direct INSERT RLS (force through request_payout() RPC)
-- 4. Payout requests: remove direct INSERT RLS (force through request_payout())
-- 5. Site settings: create public view without secrets
-- 6. Social accounts: remove direct client INSERT (force through OAuth flow)
-- 7. Social connections: remove direct client writes (server-only)
-- 8. Social OAuth states: remove direct client access (server-only)
-- 9. Revoke execute on anon-only sensitive functions
-- 10. Revoke execute on legacy superseded functions
-- 11. Ensure request_payout() remains executable by authenticated
-- ===========================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. FIX: get_wallet_balance — add ownership check
-- Any authenticated user could call this with any UUID to see another
-- user's wallet balance. Now: user can only query own balance, admins can query any.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_user_id OR public.is_admin() THEN
      jsonb_build_object(
        'user_id', p_user_id,
        'available', coalesce((
          SELECT sum(fr.net_amount)
          FROM public.financial_records fr
          WHERE fr.clipper_id = p_user_id AND fr.status = 'processing'
        ), 0)
          - coalesce((
          SELECT sum(pr.net_amount)
          FROM public.payout_requests pr
          WHERE pr.user_id = p_user_id AND pr.status IN ('pending', 'processing', 'paid')
        ), 0),
        'currency', 'INR',
        'total_earned', coalesce((
          SELECT sum(fr.net_amount)
          FROM public.financial_records fr
          WHERE fr.clipper_id = p_user_id
        ), 0),
        'total_paid', coalesce((
          SELECT sum(fr.net_amount)
          FROM public.financial_records fr
          WHERE fr.clipper_id = p_user_id AND fr.status = 'paid'
        ), 0),
        'total_requested', coalesce((
          SELECT sum(pr.net_amount)
          FROM public.payout_requests pr
          WHERE pr.user_id = p_user_id AND pr.status IN ('pending', 'processing', 'paid')
        ), 0)
      )
    ELSE
      jsonb_build_object('error', 'Unauthorized', 'available', 0)
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. FIX: get_clipper_finance_records — add ownership check
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_clipper_finance_records(
  p_clipper_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_clipper_id OR public.is_admin() THEN
      coalesce(jsonb_agg(fr.*), '[]'::jsonb)
    ELSE
      '[]'::jsonb
  END
  FROM (
    SELECT * FROM public.financial_records
    WHERE clipper_id = p_clipper_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) fr;
$$;

GRANT EXECUTE ON FUNCTION public.get_clipper_finance_records(uuid, integer, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. FIX: get_payout_requests — add ownership check
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payout_requests(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_user_id OR public.is_admin() THEN
      coalesce(jsonb_agg(pr.*), '[]'::jsonb)
    ELSE
      '[]'::jsonb
    END
  FROM (
    SELECT * FROM public.payout_requests
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) pr;
$$;

GRANT EXECUTE ON FUNCTION public.get_payout_requests(uuid, integer, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FIX: get_all_payout_requests — admin-only
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_payout_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin() THEN
      coalesce(jsonb_agg(pr.*), '[]'::jsonb)
    ELSE
      '[]'::jsonb
  END
  FROM (
    SELECT * FROM public.payout_requests
    WHERE (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) pr;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_payout_requests(text, integer, integer) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. FIX: Notifications — prevent notification forgery
-- Users should NOT be able to insert notifications for other users.
-- Only admin/system should create notifications.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_admin());

-- Users can mark their own notifications as read, but not modify title/message
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 6. FIX: Payouts — remove direct INSERT for authenticated users
-- The old payouts table allows direct INSERT via RLS, bypassing the
-- request_payout() RPC's balance validation and advisory lock.
-- All payout creation must go through request_payout().
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payouts_insert" ON public.payouts;
-- No replacement: authenticated users cannot INSERT directly.
-- request_payout() uses SECURITY DEFINER to bypass RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- 7. FIX: Payout requests — remove direct INSERT for authenticated users
-- The payout_requests INSERT policy allows direct client inserts with
-- auth.uid() = user_id, bypassing request_payout()'s validation.
-- All payout creation must go through request_payout().
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payout_requests_insert" ON public.payout_requests;
-- No replacement: authenticated users cannot INSERT directly.
-- request_payout() uses SECURITY DEFINER to bypass RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- 8. FIX: Social accounts — remove direct client INSERT
-- Users should connect social accounts through server-side OAuth flow,
-- not by inserting rows directly. Direct inserts could bypass OAuth
-- verification and allow setting verified=true.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_accounts_insert" ON public.social_accounts;
-- Users can still SELECT own, UPDATE own non-trusted fields, DELETE own.
-- Connection is initiated via the OAuth flow (server-side).

-- ────────────────────────────────────────────────────────────────────────────
-- 9. FIX: Social connections — remove direct client writes
-- Token data is server-only. Users should not INSERT or UPDATE
-- connections directly. OAuth callback creates/updates them server-side.
-- Users can disconnect (DELETE) their own connections.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_connections_insert" ON public.social_connections;
DROP POLICY IF EXISTS "social_connections_update" ON public.social_connections;
-- DELETE is kept: users can disconnect their own connections via API.

-- ────────────────────────────────────────────────────────────────────────────
-- 10. FIX: Social OAuth states — remove direct client access
-- OAuth states are temporary security records used by the callback.
-- They should NOT be readable or writable by the browser.
-- The OAuth callback uses service-role to access them.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_oauth_states_insert" ON public.social_oauth_states;
DROP POLICY IF EXISTS "social_oauth_states_delete" ON public.social_oauth_states;
-- No SELECT policy exists (RLS blocks all reads by default).

-- ────────────────────────────────────────────────────────────────────────────
-- 11. FIX: Site settings — drop obsolete razorpay_key column, create public view
-- The razorpay_key column is obsolete (no Razorpay integration) and was
-- world-readable via the site_settings SELECT policy. Drop it and create
-- a safe public view exposing only non-secret fields.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_settings DROP COLUMN IF EXISTS razorpay_key;

CREATE OR REPLACE VIEW public.site_settings_public AS
  SELECT id, hero_title, hero_subtitle, featured_ids, updated_at
  FROM public.site_settings;

-- Grant public read on the view
GRANT SELECT ON public.site_settings_public TO anon;
GRANT SELECT ON public.site_settings_public TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. Revoke anon execute on user_exists (email enumeration)
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.user_exists(text) FROM anon;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. Revoke execute on legacy superseded functions
-- These functions from admin-schema.sql are replaced by financial-rewrite.sql
-- and finance-consolidation.sql. They are NOT called by any active code.
-- Uses specific exception handling for each known function signature.
-- ────────────────────────────────────────────────────────────────────────────

-- Legacy earnings functions (replaced by financial_records)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.create_earning(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_earning_status(uuid, text, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_clipper_earnings(uuid) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Legacy wallet ledger functions (replaced by financial_records)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_wallet_entries(uuid, integer, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.adjust_wallet(uuid, integer, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.reverse_ledger_entry(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Legacy payout functions (replaced by payout_requests)
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.process_payout(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.complete_payout(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.fail_payout(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.reverse_payout(uuid, text) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_user_payouts(uuid, integer, integer) FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Legacy test function
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.test_max_payout_enforcement() FROM authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. Ensure request_payout() is executable by authenticated
-- This is the legitimate new payout RPC. Must remain accessible.
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.request_payout() TO authenticated;

-- Ensure admin payout functions are executable (they verify admin internally)
GRANT EXECUTE ON FUNCTION public.process_payout_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payout_request(uuid, text, text) TO authenticated;

-- Ensure admin clip functions are executable (they verify admin internally)
GRANT EXECUTE ON FUNCTION public.approve_clip(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clip_action(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_action(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_campaign_action(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_action(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_campaign_budget(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_own_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clip_status(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clip_views(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_verified_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clip_metrics(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_budget(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. FIX: Stop exposing full financial_records to campaign creators
-- The previous policy allowed creators to SELECT full financial_records rows
-- for their campaigns, exposing clipper_id, upi_id_snapshot, payment_reference,
-- and other sensitive fields.
--
-- Fix: Remove creator SELECT access from the base table. Create a SECURITY
-- DEFINER function that returns safe financial records:
--   - Clippers: own records (all fields)
--   - Creators: records for their campaigns (sensitive fields nulled)
--   - Admins: all records (all fields)
--
-- The store calls this function instead of direct SELECT on financial_records.
-- All existing financeOf/campaignSpent/campaignBudget functions work unchanged.
-- ────────────────────────────────────────────────────────────────────────────

-- 15a. Remove creator SELECT from financial_records
DROP POLICY IF EXISTS "financial_records_select" ON public.financial_records;
CREATE POLICY "financial_records_select" ON public.financial_records
  FOR SELECT USING (
    auth.uid() = clipper_id
    OR public.is_admin()
  );

-- 15b. SECURITY DEFINER function: returns safe financial records per role
CREATE OR REPLACE FUNCTION public.get_safe_finance_records()
RETURNS SETOF public.financial_records
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fr.id,
    fr.clip_id,
    fr.campaign_id,
    -- Hide clipper identity from creators
    CASE WHEN public.is_admin() OR auth.uid() = fr.clipper_id
      THEN fr.clipper_id ELSE NULL END AS clipper_id,
    fr.locked_cpm,
    fr.locked_max_payout,
    fr.verified_views,
    fr.gross_amount,
    fr.platform_fee,
    fr.net_amount,
    fr.status,
    -- Hide sensitive payment fields from creators
    CASE WHEN public.is_admin() OR auth.uid() = fr.clipper_id
      THEN fr.upi_id_snapshot ELSE NULL END AS upi_id_snapshot,
    CASE WHEN public.is_admin() OR auth.uid() = fr.clipper_id
      THEN fr.payment_reference ELSE NULL END AS payment_reference,
    CASE WHEN public.is_admin() OR auth.uid() = fr.clipper_id
      THEN fr.paid_by ELSE NULL END AS paid_by,
    fr.created_at,
    fr.processing_at,
    fr.paid_at,
    -- Hide audit trail from creators
    CASE WHEN public.is_admin() OR auth.uid() = fr.clipper_id
      THEN fr.audit ELSE NULL END AS audit
  FROM public.financial_records fr
  WHERE
    -- Clippers see own records
    fr.clipper_id = auth.uid()
    -- Admins see everything
    OR public.is_admin()
    -- Creators see records for their campaigns (safe fields only)
    OR EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = fr.campaign_id AND c.created_by = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_safe_finance_records() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────────────────────
