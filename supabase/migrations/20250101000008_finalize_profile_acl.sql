-- ==========================================================================
-- finalize_profile ACL hardening
--
-- Root cause of TEST 3.3 failure:
--   PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
--   Migration 20250101000006_auth_role_persistence.sql granted EXECUTE to
--   `authenticated` but never revoked the default PUBLIC privilege, so the
--   `anon` role could still execute public.finalize_profile(text) through
--   PUBLIC (has_function_privilege('anon', ...) returned true).
--
-- This migration explicitly enforces the intended ACL:
--   - PUBLIC: no EXECUTE
--   - anon: no EXECUTE
--   - authenticated: EXECUTE (unchanged / idempotent re-assert)
--
-- NOT changed here (preserved intentionally):
--   - finalize_profile() implementation (SECURITY DEFINER,
--     SET search_path = public, auth.uid() authorization, role validation,
--     existing-profile-wins, admin rejection)
--   - migration 000006 itself (already applied)
--   - OAuth intent flow, RLS, campaign/payment security
--
-- Note: CREATE OR REPLACE FUNCTION in 000006 does not reset ACLs on an
-- existing function, so these REVOKEs are the lasting fix. REVOKE from a
-- role that lacks the privilege is a no-op (no error), making this idempotent.
-- ==========================================================================

REVOKE EXECUTE ON FUNCTION public.finalize_profile(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_profile(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_profile(text) TO authenticated;
