-- =============================================================================
-- ingest_clip_metrics security tests — helper setup (STEP 1 of 4)
-- =============================================================================
--
-- REQUIRED RUN ORDER (Supabase SQL Editor, after applying migration 000010):
--   1. Run supabase/ingest-clip-metrics-security-test-setup.sql  (this file)
--   2. Run supabase/ingest-clip-metrics-security-tests.sql
--   3. Confirm every test prints PASS and there are zero FAIL warnings
--   4. Run supabase/ingest-clip-metrics-security-test-cleanup.sql
--
-- The main test file contains ONLY test execution and does not create any
-- helper functions, so each submission resolves against helpers created by a
-- previous submission. Setup succeeding does NOT mean the tests passed —
-- only step 3 does.
--
-- NOT EXECUTED AUTOMATICALLY AND NOT RUN AGAINST PRODUCTION.
-- =============================================================================

-- Asserts a single A–L condition and prints "PASS: ..." or "FAIL: ...".
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
