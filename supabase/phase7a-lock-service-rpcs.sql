-- =============================================================================
-- Phase 7A Step 1: Lock down service-only metrics/sync RPCs
-- =============================================================================
--
-- PROBLEM:
-- All five functions are SECURITY DEFINER but only GRANT to service_role.
-- PostgreSQL defaults give PUBLIC EXECUTE on all functions, meaning
-- anon and authenticated can call SECURITY DEFINER functions and execute
-- them with the function owner's (superuser) privileges.
--
-- FUNCTIONS AFFECTED:
--   1. public.ingest_clip_metrics(...)
--   2. public.finalize_clip_earning(...)
--   3. public.acquire_sync_lock(...)
--   4. public.release_sync_lock(...)
--   5. public.renew_sync_lock(...)
--
-- FIX:
-- REVOKE EXECUTE from PUBLIC (which includes anon and authenticated).
-- REVOKE EXECUTE explicitly from anon and authenticated for clarity.
-- RE-GRANT EXECUTE to service_role (idempotent).
--
-- DUPLICATE DEFINITIONS:
-- acquire_sync_lock, release_sync_lock, renew_sync_lock exist in both
-- auto-metrics-sync.sql and fix-cron-secrets.sql. The later file's
-- CREATE OR REPLACE wins. This migration applies AFTER all definitions
-- and is safe regardless of migration order because REVOKE is idempotent.
--
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ingest_clip_metrics — service-only metrics ingestion
-- ─────────────────────────────────────────────────────────────────────────────

-- Revoke from PUBLIC (covers both anon and authenticated via inheritance)
REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM PUBLIC;

-- Explicit revocations for clarity and defense-in-depth
REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) FROM authenticated;

-- Re-grant to service_role (idempotent — already granted in admin-schema.sql)
GRANT EXECUTE ON FUNCTION public.ingest_clip_metrics(uuid, integer, integer, integer, integer, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. finalize_clip_earning — service-only earning finalization
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_clip_earning(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. acquire_sync_lock — service-only lock acquisition
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. release_sync_lock — service-only lock release
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. renew_sync_lock — service-only lock renewal (heartbeat)
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) TO service_role;

-- =============================================================================
-- VERIFICATION QUERIES (run manually to confirm)
-- =============================================================================
-- SELECT
--   r.rolname,
--   has_function_privilege(r.rolname, 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE') as can_ingest,
--   has_function_privilege(r.rolname, 'public.finalize_clip_earning(uuid)', 'EXECUTE') as can_finalize,
--   has_function_privilege(r.rolname, 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE') as can_acquire,
--   has_function_privilege(r.rolname, 'public.release_sync_lock(text,uuid)', 'EXECUTE') as can_release,
--   has_function_privilege(r.rolname, 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE') as can_renew
-- FROM pg_roles r
-- WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
-- ORDER BY r.rolname;
--
-- Expected:
--   anon:          all false
--   authenticated: all false
--   service_role:  all true
--   postgres:      all true (function owner, SECURITY DEFINER)
