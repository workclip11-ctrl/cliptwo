-- ============================================================================
-- REVOKE TEMPORARY TABLE PRIVILEGE FROM AUTHENTICATED AND ANON
-- ============================================================================
-- Problem:
--   The _campaign_transition_signal and _cf_verify_signal temp-table-as-
--   authorization-signal pattern relies on PostgREST connections being unable
--   to CREATE in pg_temp. However, PostgreSQL grants TEMPORARY on the database
--   to PUBLIC by default, which means the authenticated and anon roles inherit
--   this privilege. An authenticated user can:
--
--     CREATE TEMPORARY TABLE _campaign_transition_signal (id int);
--     UPDATE campaigns SET status = 'paused' WHERE id = '...';
--
--   The trigger fires in the same session, finds the forged temp table via
--   LIKE 'pg_temp%', and allows the unauthorized status change.
--
-- Solution:
--   REVOKE TEMPORARY ON DATABASE from authenticated, anon, and PUBLIC.
--   SECURITY DEFINER functions (e.g., campaign_action, verify_cashfree_webhook)
--   execute with the owner's privileges (postgres) and are NOT affected by
--   this revocation. They can still create temp tables as authorization signals.
--
-- Run AFTER: 20250101000003_lock_direct_campaign_status_updates.sql
-- Safe to run multiple times (idempotent REVOKE).
-- =============================================================================

-- Revoke TEMPORARY privilege from PUBLIC (the source of the default grant)
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;

-- Revoke TEMPORARY from specific PostgREST roles
REVOKE TEMPORARY ON DATABASE postgres FROM authenticated;
REVOKE TEMPORARY ON DATABASE postgres FROM anon;

-- Verify the revocation took effect (informational, will show in migration output)
DO $$
BEGIN
  -- Confirm authenticated cannot create temp tables
  ASSERT NOT has_database_privilege('authenticated', 'postgres', 'TEMPORARY'),
    'authenticated should NOT have TEMPORARY privilege on postgres database';

  -- Confirm anon cannot create temp tables
  ASSERT NOT has_database_privilege('anon', 'postgres', 'TEMPORARY'),
    'anon should NOT have TEMPORARY privilege on postgres database';

  RAISE NOTICE 'TEMPORARY privilege successfully revoked from authenticated and anon';
END $$;
