-- ============================================================================
-- Campaign Visibility & RLS (Phase 4)
-- ============================================================================
-- Replaces the world-readable campaigns_select policy (USING (true)) with
-- role-based visibility:
--
--   Creator:  can SELECT own campaigns (any status)
--   Admin:    can SELECT all campaigns
--   Clipper:  can SELECT ONLY status='open' AND launch_payment_status='verified'
--   Anon:     no access to campaign rows
--
-- This migration is idempotent — safe to run multiple times.
-- ============================================================================

-- 1. Drop the old world-readable SELECT policy
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;

-- 2. Creator sees own campaigns (any status)
CREATE POLICY "campaigns_select_creator"
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- 3. Admin sees all campaigns
CREATE POLICY "campaigns_select_admin"
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 4. Clipper sees only open + verified campaigns
CREATE POLICY "campaigns_select_clipper"
  ON public.campaigns
  FOR SELECT
  TO authenticated
  USING (
    status = 'open'
    AND launch_payment_status = 'verified'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'clipper'
    )
  );
