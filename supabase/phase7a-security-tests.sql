-- =============================================================================
-- Phase 7A Step 1: Security tests for service-only RPCs
-- =============================================================================
--
-- These tests verify that anon and authenticated roles CANNOT execute
-- the five service-only functions after the privilege hardening in
-- phase7a-lock-service-rpcs.sql.
--
-- TEST INFRASTRUCTURE NOTE:
-- PostgreSQL's has_function_privilege() function can check privileges
-- without actually executing the function. This is the correct way to
-- test privilege grants/revokes — we do NOT need to simulate service_role
-- execution to verify the privilege model.
--
-- To run these tests in Supabase SQL Editor:
--   1. Execute this entire file.
--   2. All tests should return 'PASS' or a descriptive result.
--   3. If any test returns 'FAIL', the privilege model is broken.
--
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Test infrastructure
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._phase7a_assert(
  p_test_name text,
  p_condition boolean,
  p_detail text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_condition THEN
    RAISE NOTICE 'PASS: % %', p_test_name, p_detail;
  ELSE
    RAISE WARNING 'FAIL: % %', p_test_name, p_detail;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. anon cannot execute ingest_clip_metrics
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'A: anon cannot execute ingest_clip_metrics',
  NOT has_function_privilege('anon', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'anon has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- B. authenticated cannot execute ingest_clip_metrics
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'B: authenticated cannot execute ingest_clip_metrics',
  NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'authenticated has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- C. anon cannot execute finalize_clip_earning
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'C: anon cannot execute finalize_clip_earning',
  NOT has_function_privilege('anon', 'public.finalize_clip_earning(uuid)', 'EXECUTE'),
  'anon has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- D. authenticated cannot execute finalize_clip_earning
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'D: authenticated cannot execute finalize_clip_earning',
  NOT has_function_privilege('authenticated', 'public.finalize_clip_earning(uuid)', 'EXECUTE'),
  'authenticated has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- E. anon cannot execute acquire_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'E: anon cannot execute acquire_sync_lock',
  NOT has_function_privilege('anon', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'anon has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- F. authenticated cannot execute acquire_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'F: authenticated cannot execute acquire_sync_lock',
  NOT has_function_privilege('authenticated', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'authenticated has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- G. anon cannot execute release_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'G: anon cannot execute release_sync_lock',
  NOT has_function_privilege('anon', 'public.release_sync_lock(text,uuid)', 'EXECUTE'),
  'anon has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- H. authenticated cannot execute release_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'H: authenticated cannot execute release_sync_lock',
  NOT has_function_privilege('authenticated', 'public.release_sync_lock(text,uuid)', 'EXECUTE'),
  'authenticated has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- I. anon cannot execute renew_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'I: anon cannot execute renew_sync_lock',
  NOT has_function_privilege('anon', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'anon has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- J. authenticated cannot execute renew_sync_lock
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'J: authenticated cannot execute renew_sync_lock',
  NOT has_function_privilege('authenticated', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'authenticated has EXECUTE — PRIVILEGE ESCALATION VULNERABILITY'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- POSITIVE TESTS: service_role CAN execute all five functions
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: We use has_function_privilege() to verify the grant exists.
-- Actually calling these functions requires a live service_role JWT context
-- which cannot be simulated in SQL Editor. The privilege check is sufficient.

SELECT public._phase7a_assert(
  'POSITIVE: service_role can execute ingest_clip_metrics',
  has_function_privilege('service_role', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'service_role missing EXECUTE — service will break'
);

SELECT public._phase7a_assert(
  'POSITIVE: service_role can execute finalize_clip_earning',
  has_function_privilege('service_role', 'public.finalize_clip_earning(uuid)', 'EXECUTE'),
  'service_role missing EXECUTE — service will break'
);

SELECT public._phase7a_assert(
  'POSITIVE: service_role can execute acquire_sync_lock',
  has_function_privilege('service_role', 'public.acquire_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'service_role missing EXECUTE — service will break'
);

SELECT public._phase7a_assert(
  'POSITIVE: service_role can execute release_sync_lock',
  has_function_privilege('service_role', 'public.release_sync_lock(text,uuid)', 'EXECUTE'),
  'service_role missing EXECUTE — service will break'
);

SELECT public._phase7a_assert(
  'POSITIVE: service_role can execute renew_sync_lock',
  has_function_privilege('service_role', 'public.renew_sync_lock(text,uuid,integer)', 'EXECUTE'),
  'service_role missing EXECUTE — service will break'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPLEMENTARY: Verify all functions are SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._phase7a_assert(
  'SUPPLEMENTARY: ingest_clip_metrics is SECURITY DEFINER',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'ingest_clip_metrics'
      AND p.prosecdef = true
  ),
  'Function is not SECURITY DEFINER — privilege model may be weak'
);

SELECT public._phase7a_assert(
  'SUPPLEMENTARY: finalize_clip_earning is SECURITY DEFINER',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'finalize_clip_earning'
      AND p.prosecdef = true
  ),
  'Function is not SECURITY DEFINER — privilege model may be weak'
);

SELECT public._phase7a_assert(
  'SUPPLEMENTARY: acquire_sync_lock is SECURITY DEFINER',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'acquire_sync_lock'
      AND p.prosecdef = true
  ),
  'Function is not SECURITY DEFINER — privilege model may be weak'
);

SELECT public._phase7a_assert(
  'SUPPLEMENTARY: release_sync_lock is SECURITY DEFINER',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'release_sync_lock'
      AND p.prosecdef = true
  ),
  'Function is not SECURITY DEFINER — privilege model may be weak'
);

SELECT public._phase7a_assert(
  'SUPPLEMENTARY: renew_sync_lock is SECURITY DEFINER',
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'renew_sync_lock'
      AND p.prosecdef = true
  ),
  'Function is not SECURITY DEFINER — privilege model may be weak'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._phase7a_assert(text, boolean, text);
