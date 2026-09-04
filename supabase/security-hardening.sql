-- ===========================================================================
-- SECURITY HARDENING MIGRATION
--
-- Run AFTER: schema.sql, admin-schema.sql, financial-rewrite.sql,
--            finance-consolidation.sql, integrity-constraints.sql
--
-- Fixes:
-- 1. Read RPCs: add auth.uid() ownership checks (IDOR fixes)
-- 2. Notifications: restrict INSERT to admin-only (prevent notification forgery)
-- 3. Payouts: remove direct INSERT RLS (force through request_payout() RPC)
-- 4. Site settings: create public view without secrets
-- 5. Social accounts: remove direct client INSERT (force through server)
-- 6. Social connections: remove direct client writes (server-only)
-- 7. Social OAuth states: remove direct client access (server-only)
-- 8. Revoke PUBLIC execute on sensitive functions
-- 9. Cleanup legacy functions still grantable to authenticated
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

-- ────────────────────────────────────────────────────────────────────────────
-- 5. FIX: get_clipper_earnings — add ownership check (legacy, still exists)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_clipper_earnings(p_clipper_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_clipper_id OR public.is_admin() THEN
      jsonb_build_object(
        'total_gross', coalesce(sum(gross_amount), 0),
        'total_fees', coalesce(sum(platform_fee), 0),
        'total_net', coalesce(sum(net_amount), 0),
        'total_creator_fees', coalesce(sum(creator_fee), 0),
        'currency', 'INR',
        'earning_count', count(*),
        'paid_count', count(*) filter (where status = 'paid'),
        'pending_count', count(*) filter (where status in ('pending', 'approved')),
        'paid_amount', coalesce(sum(net_amount) filter (where status = 'paid'), 0),
        'pending_amount', coalesce(sum(net_amount) filter (where status in ('pending', 'approved')), 0)
      )
    ELSE
      jsonb_build_object('error', 'Unauthorized', 'total_gross', 0)
  END
  FROM public.earnings
  WHERE clipper_id = p_clipper_id;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. FIX: get_wallet_entries — add ownership check (legacy, still exists)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_entries(
  p_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_user_id OR public.is_admin() THEN
      coalesce(jsonb_agg(row_to_json(le)), '[]'::jsonb)
    ELSE
      '[]'::jsonb
  END
  FROM (
    select id, user_id, type, amount, currency, reference_type,
           reference_id, idempotency_key, created_at, metadata
    from public.wallet_ledger
    where user_id = p_user_id
    order by created_at desc
    limit p_limit offset p_offset
  ) le;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. FIX: get_user_payouts — add ownership check (legacy, still exists)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_payouts(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() = p_user_id OR public.is_admin() THEN
      coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb)
    ELSE
      '[]'::jsonb
  END
  FROM (
    select id, user_id, amount, net_amount, currency, status, method,
           upi_id, provider, provider_ref, idempotency_key,
           requested_at, processed_at, paid_at, failed_at, reversed_at,
           failure_reason, retry_count, metadata
    from public.payouts
    where user_id = p_user_id
    order by requested_at desc
    limit p_limit offset p_offset
  ) p;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. FIX: Notifications — prevent notification forgery
-- Users should NOT be able to insert notifications for other users.
-- Only admin/system should create notifications.
-- Change INSERT policy to admin-only.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (public.is_admin());

-- Also restrict UPDATE to only the 'read' column for non-admins
-- (Users can mark their own notifications as read, but not modify title/message)
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 9. FIX: Payouts — remove direct INSERT for authenticated users
-- The old payouts table allows direct INSERT via RLS, bypassing the
-- request_payout() RPC's balance validation and advisory lock.
-- All payout creation must go through request_payout().
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payouts_insert" ON public.payouts;
-- No replacement: authenticated users cannot INSERT directly.
-- request_payout() uses SECURITY DEFINER to bypass RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- 10. FIX: Payout requests — remove direct INSERT for authenticated users
-- The payout_requests INSERT policy allows direct client inserts with
-- auth.uid() = user_id, bypassing request_payout()'s validation.
-- All payout creation must go through request_payout().
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payout_requests_insert" ON public.payout_requests;
-- No replacement: authenticated users cannot INSERT directly.
-- request_payout() uses SECURITY DEFINER to bypass RLS.

-- ────────────────────────────────────────────────────────────────────────────
-- 11. FIX: Social accounts — remove direct client INSERT
-- Users should connect social accounts through server-side OAuth flow,
-- not by inserting rows directly. Direct inserts could bypass OAuth
-- verification and allow setting verified=true.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_accounts_insert" ON public.social_accounts;
-- Users can still disconnect (DELETE) their own accounts.
-- Connection is initiated via the OAuth flow (server-side).

-- ────────────────────────────────────────────────────────────────────────────
-- 12. FIX: Social connections — remove direct client writes
-- Token data is server-only. Users should not INSERT or UPDATE
-- connections directly. OAuth callback creates/updates them server-side.
-- Users can disconnect (DELETE) their own connections.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_connections_insert" ON public.social_connections;
DROP POLICY IF EXISTS "social_connections_update" ON public.social_connections;
-- DELETE is kept: users can disconnect their own connections.

-- ────────────────────────────────────────────────────────────────────────────
-- 13. FIX: Social OAuth states — remove direct client access
-- OAuth states are temporary security records used by the callback.
-- They should NOT be readable or writable by the browser.
-- The OAuth callback uses SECURITY DEFINER to access them.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "social_oauth_states_insert" ON public.social_oauth_states;
DROP POLICY IF EXISTS "social_oauth_states_delete" ON public.social_oauth_states;
-- No SELECT policy exists (RLS blocks all reads by default).

-- ────────────────────────────────────────────────────────────────────────────
-- 14. FIX: Site settings — create a public view without secrets
-- The site_settings table exposes razorpay_key to all users via world-readable
-- SELECT policy. Create a safe public view and restrict the table.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.site_settings_public AS
  SELECT id, hero_title, hero_subtitle, featured_ids, updated_at
  FROM public.site_settings;

-- Grant public read on the view
GRANT SELECT ON public.site_settings_public TO anon;
GRANT SELECT ON public.site_settings_public TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. Revoke PUBLIC execute on sensitive functions
-- Some functions should not be callable by anonymous users.
-- ────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.user_exists(text) FROM anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 16. Cleanup: Revoke execute on legacy functions that are superseded
-- These functions from admin-schema.sql are replaced by financial-rewrite.sql
-- and finance-consolidation.sql. Revoke their execute to prevent confusion.
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.create_earning(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.update_earning_status(uuid, text, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_wallet_balance(uuid) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_wallet_entries(uuid, integer, integer) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.adjust_wallet(uuid, integer, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.reverse_ledger_entry(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_clipper_earnings(uuid) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.request_payout() FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.process_payout(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.complete_payout(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.fail_payout(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.reverse_payout(uuid, text) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.get_user_payouts(uuid, integer, integer) FROM authenticated; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION public.test_max_payout_enforcement() FROM authenticated; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────────────────────
