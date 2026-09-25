-- =============================================================================
-- ingest_clip_metrics authorization security tests (A–L)
-- =============================================================================
--
-- Validates the hardening applied by
--   migrations/20250101000010_harden_ingest_clip_metrics.sql
-- on top of the existing privilege lock (phase7a-lock-service-rpcs.sql /
-- security-hardening-migration.sql PART 15).
--
-- What is covered:
--   A  anon: no EXECUTE privilege + internal guard denies anon JWT
--   B  Creator (authenticated): no EXECUTE + internal guard denies JWT
--   C  Clipper (authenticated, different sub): internal guard denies JWT
--   D  authenticated denied for every restricted source (mock/manual/admin_override)
--   E  authenticated cannot manufacture verification_status ('verified'/'pending')
--   F  service_role backend path is platform_api-only (restricted sources denied)
--   G  service_role + platform_api + verified passes authorization (pipeline works)
--   H  direct admin session: platform_api ingestion works
--   I  direct admin session: mock/manual/admin_override retained for investigations
--   J  fail-closed: malformed / role-less JWT claims are denied
--   K  privilege model: service_role only, internal guard present in the body
--   L  no unauthorized verified-metrics path (RLS insert, immutability,
--      regression guard, SECURITY DEFINER + search_path, finalize preserved)
--
-- HOW TO RUN (Supabase SQL Editor, after applying migration 000010):
--   1. Execute this entire file.
--   2. Every test must print "PASS: ...". Any "WARNING: FAIL: ..." is a breach.
--   3. Tests simulate JWT sessions via the authoritative request.jwt.claims
--      GUC (the same mechanism PostgREST uses); no fake users are created
--      (FK constraints) and no clip/campaign fixture rows are written — the
--      data path is proven up to the "Clip not found" boundary.
--
-- TYPE RESOLUTION NOTE: every call to public._ingest_sec_assert(...) casts its
-- string-literal arguments with ::text so the call always resolves to the one
-- deterministic signature _ingest_sec_assert(text, boolean, text) — never to
-- untyped (unknown, boolean, unknown) literals (PostgreSQL error 42883).
--
-- NOT EXECUTED AUTOMATICALLY AND NOT RUN AGAINST PRODUCTION.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Test infrastructure
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ingest_sec_assert(
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

-- Attempts an ingest call under a simulated JWT claims payload and returns
-- 'OK' when the call succeeded, otherwise the exact SQLERRM. The clip id is
-- a well-known non-existent uuid, so an authorized call can never write —
-- it proves the authorization boundary by reaching 'Clip not found'.
CREATE OR REPLACE FUNCTION public._ingest_sec_try_call(
  p_claims text,
  p_source text,
  p_verification_status text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_err text;
BEGIN
  PERFORM set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  BEGIN
    PERFORM public.ingest_clip_metrics(
      'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
      1000, 1, 1, 1,
      p_source,
      p_verification_status
    );
    PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_err;
END;
$$;

-- Test helpers are for the SQL Editor session only
REVOKE EXECUTE ON FUNCTION public._ingest_sec_assert(text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._ingest_sec_try_call(text, text, text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. anon cannot invoke ingest_clip_metrics (privilege + internal guard)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'A1: anon has no EXECUTE on ingest_clip_metrics'::text,
  NOT has_function_privilege('anon', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'anon holds EXECUTE — the public RPC hole is re-opened (apply migration 000010)'::text
);

SELECT public._ingest_sec_assert(
  'A2: internal guard denies anon JWT (defense-in-depth)'::text,
  r like '%denied for JWT role "anon"%',
  ('internal guard must deny even if EXECUTE were re-granted; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"anon"}', 'platform_api', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Creator (authenticated) cannot invoke ingest_clip_metrics
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'B1: authenticated (Creator) has no EXECUTE on ingest_clip_metrics'::text,
  NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'authenticated holds EXECUTE — any Creator could call the RPC directly'::text
);

SELECT public._ingest_sec_assert(
  'B2: internal guard denies authenticated Creator JWT'::text,
  r like '%denied for JWT role "authenticated"%',
  ('Creator session must never reach the ingest body; got: ' || r)::text
)
FROM (
  SELECT public._ingest_sec_try_call(
    '{"sub":"e92427b0-254e-44cc-b2df-be83792c8a94","role":"authenticated"}',
    'platform_api', 'verified') AS r
) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Clipper (authenticated, different identity) cannot invoke it
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'C1: internal guard denies authenticated Clipper JWT'::text,
  r like '%denied for JWT role "authenticated"%',
  ('Clipper session must never reach the ingest body; got: ' || r)::text
)
FROM (
  SELECT public._ingest_sec_try_call(
    '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
    'platform_api', 'verified') AS r
) s;

SELECT public._ingest_sec_assert(
  'C2: Clipper has no EXECUTE on ingest_clip_metrics'::text,
  NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'same role as B1 — asserted per identity for the audit trail'::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- D. authenticated denied for every restricted source
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'D1: authenticated + source "mock" denied'::text,
  r like '%denied for JWT role "authenticated"%',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"authenticated"}', 'mock', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'D2: authenticated + source "manual" denied'::text,
  r like '%denied for JWT role "authenticated"%',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"authenticated"}', 'manual', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'D3: authenticated + source "admin_override" denied'::text,
  r like '%denied for JWT role "authenticated"%',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"authenticated"}', 'admin_override', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- E. authenticated cannot manufacture verification_status
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'E1: authenticated cannot ingest verification_status="verified"'::text,
  r like '%denied for JWT role "authenticated"%',
  ('verified metrics must be unreachable for ordinary sessions; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"authenticated"}', 'platform_api', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'E2: authenticated denied for "pending" too (no status reaches the body)'::text,
  r like '%denied for JWT role "authenticated"%',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"authenticated"}', 'platform_api', 'pending') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- F. service_role backend path is platform_api-only
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'F1: service_role + source "mock" rejected (platform_api-only backend)'::text,
  r like '%backend path allows source "platform_api" only%',
  ('test-only source must be unreachable through server API workflows; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"service_role"}', 'mock', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'F2: service_role + source "manual" rejected'::text,
  r like '%backend path allows source "platform_api" only%',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"service_role"}', 'manual', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'F3: service_role + source "admin_override" rejected'::text,
  r like '%backend path allows source "platform_api" only%',
  ('admin overrides must go through direct admin sessions, not the API path; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"service_role"}', 'admin_override', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- G. trusted backend pipeline keeps working (authorization passes)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'G1: service_role + platform_api + verified passes authorization'::text,
  r like 'Clip not found: %',
  ('expected data-boundary error (authz + source tier passed); got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"service_role"}', 'platform_api', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'G2: service_role + platform_api + pending also passes authorization'::text,
  r like 'Clip not found: %',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{"role":"service_role"}', 'platform_api', 'pending') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- H. direct admin session (SQL editor) keeps working
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'H1: direct session + platform_api passes authorization'::text,
  r like 'Clip not found: %',
  ('admin SQL-editor path must remain usable; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('', 'platform_api', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- I. direct admin session retains restricted sources for investigations
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'I1: direct session + "mock" passes authorization'::text,
  r like 'Clip not found: %',
  ('mock retained for manual backfills/investigations only; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('', 'mock', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'I2: direct session + "manual" passes authorization'::text,
  r like 'Clip not found: %',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('', 'manual', 'pending') AS r) s;

SELECT public._ingest_sec_assert(
  'I3: direct session + "admin_override" passes authorization'::text,
  r like 'Clip not found: %',
  ('got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('', 'admin_override', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'I4: direct session + unknown source still rejected'::text,
  r like 'Invalid source: %',
  ('input validation must survive on the direct path; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('', 'telemetry', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- J. fail-closed on malformed / role-less claims
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'J1: malformed JWT claims are denied'::text,
  r like '%malformed JWT claims%',
  ('fail-closed required; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('not-json-at-all', 'platform_api', 'verified') AS r) s;

SELECT public._ingest_sec_assert(
  'J2: claims without a role are denied'::text,
  r like '%denied for JWT role ""%',
  ('role-less claims must not be treated as a direct session; got: ' || r)::text
)
FROM (SELECT public._ingest_sec_try_call('{}', 'platform_api', 'verified') AS r) s;

-- ─────────────────────────────────────────────────────────────────────────────
-- K. privilege model + internal guard present
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public._ingest_sec_assert(
  'K1: service_role retains EXECUTE (trusted pipeline unchanged)'::text,
  has_function_privilege('service_role', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE'),
  'service_role lost EXECUTE — sync/cron/admin-trigger routes would break'::text
);

SELECT public._ingest_sec_assert(
  'K2: PUBLIC/anon/authenticated hold no EXECUTE and guard is in the body'::text,
  NOT has_function_privilege('anon', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.ingest_clip_metrics(uuid,integer,integer,integer,integer,text,text)', 'EXECUTE')
    AND EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'ingest_clip_metrics'
        AND p.prosrc LIKE '%request.jwt.claims%'
    ),
  'ACL or internal authorization guard missing — apply migration 000010'::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- L. no unauthorized verified-metrics path
-- ─────────────────────────────────────────────────────────────────────────────

-- L1: RLS still forbids direct verified-row insertion by a normal session.
-- Uses an explicit transaction so SET LOCAL ROLE/claims apply (RLS depends on
-- the actual session role, not on the claims GUC alone).
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"e92427b0-254e-44cc-b2df-be83792c8a94","role":"authenticated"}';

DO $$
DECLARE
  v_err text;
  v_ok boolean;
BEGIN
  BEGIN
    INSERT INTO public.clip_metrics (clip_id, campaign_id, platform, views, likes, comments, shares, source, verification_status)
    VALUES (
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'instagram', 99999, 0, 0, 0, 'platform_api', 'verified'
    );
    v_err := 'OK';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  v_ok := v_err <> 'OK';
  IF v_ok THEN
    RAISE NOTICE 'PASS: L1 authenticated direct INSERT of verified clip_metrics row blocked (%)', v_err;
  ELSE
    RAISE WARNING 'FAIL: L1 authenticated direct INSERT of verified clip_metrics row was ALLOWED';
  END IF;
END $$;

ROLLBACK;

-- L2: the insert policy is still admin-gated (service-role/RLS architecture intact)
SELECT public._ingest_sec_assert(
  'L2: clip_metrics INSERT policy still requires public.is_admin()'::text,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clip_metrics'
      AND policyname = 'clip_metrics_insert_service'
      AND with_check LIKE '%is_admin%'
  ),
  'clip_metrics insert policy weakened — direct verified rows could be written'::text
);

-- L3: immutability policies (no UPDATE/DELETE on metric snapshots) unchanged
SELECT public._ingest_sec_assert(
  'L3: clip_metrics UPDATE/DELETE policies still deny (immutable snapshots)'::text,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clip_metrics'
      AND policyname = 'clip_metrics_no_update' AND qual LIKE '%false%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clip_metrics'
      AND policyname = 'clip_metrics_no_delete' AND qual LIKE '%false%'
  ),
  'metric snapshot immutability weakened'::text
);

-- L4: function hardening traits retained — SECURITY DEFINER, pinned
-- search_path, monotonic verified_views guard, auto-finalize, claims guard
SELECT public._ingest_sec_assert(
  'L4: SECURITY DEFINER + search_path + regression guard + finalize + claims guard retained'::text,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'ingest_clip_metrics'
      AND p.prosecdef
      AND p.proconfig::text LIKE '%search_path%'
      AND p.prosrc LIKE '%v_clip.verified_views is null then p_views%'
      AND p.prosrc LIKE '%finalize_clip_earning%'
      AND p.prosrc LIKE '%request.jwt.claims%'
      AND p.prosrc LIKE '%verification_status not in%'
  ),
  'one or more hardening traits missing from the deployed definition'::text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup of one-off helpers (safe: all assertions have already run).
-- Re-running this file recreates them first.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._ingest_sec_try_call(text, text, text);
DROP FUNCTION IF EXISTS public._ingest_sec_assert(text, boolean, text);
