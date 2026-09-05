-- ===========================================================================
-- AUTO METRICS SYNC — pg_cron + pg_net
-- ===========================================================================
-- This migration sets up automatic background metrics syncing every 30 minutes.
--
-- BEFORE RUNNING THIS MIGRATION:
--   1. Enable pg_cron:  CREATE EXTENSION IF NOT EXISTS pg_cron;
--   2. Enable pg_net:   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- AFTER RUNNING THIS MIGRATION, configure app.settings (run separately):
--   (Replace '<YOUR_CRON_SECRET>' with the same value as your Vercel CRON_SECRET env var)
--
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<YOUR_CRON_SECRET>';
--   ALTER DATABASE postgres SET app.settings.base_url = 'https://cliptwo.vercel.app';
--
-- These settings are persistent across database restarts and sessions.
-- The pg_cron job reads them at runtime via current_setting().
-- ===========================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule automatic metrics sync every 30 minutes
--    Uses net.http_post() to call the Vercel API endpoint.
--    The endpoint authenticates via CRON_SECRET Bearer token from app.settings.
--    NOTE: app.settings.cron_secret and app.settings.base_url MUST be set
--    BEFORE this job will work. See instructions above.
SELECT cron.schedule(
  'auto-metrics-sync',           -- unique job name
  '*/30 * * * *',                -- every 30 minutes
  $$
    SELECT net.http_post(
      url    := current_setting('app.settings.base_url', true) || '/api/metrics/sync/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.cron_secret', true), '')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 3. Verify the job is scheduled (optional — for manual inspection)
-- SELECT * FROM cron.job WHERE jobname = 'auto-metrics-sync';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;

-- ===========================================================================
-- ADMIN MANUAL SYNC LOCK (advisory lock to prevent overlapping syncs)
-- ===========================================================================
-- This function acquires a session-level advisory lock to prevent
-- multiple simultaneous syncs (admin-triggered AND automatic).
-- Returns true if lock was acquired, false if already running.
CREATE OR REPLACE FUNCTION public.try_acquire_sync_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lock ID 88888 is arbitrary but unique for metrics sync
  -- try_advisory_lock returns true if lock was acquired
  IF pg_try_advisory_lock(88888) THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_unlock(88888);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_acquire_sync_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock() TO service_role;

-- ===========================================================================
-- VERIFICATION QUERIES (run these after configuring app.settings)
-- ===========================================================================
-- 1. Check that app.settings are configured:
-- SELECT current_setting('app.settings.cron_secret', true) AS cron_secret;
-- SELECT current_setting('app.settings.base_url', true) AS base_url;
-- Both must return non-empty strings. If either is empty/NULL, run:
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<YOUR_CRON_SECRET>';
--   ALTER DATABASE postgres SET app.settings.base_url = 'https://cliptwo.vercel.app';
--
-- 2. Check that the cron job exists:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'auto-metrics-sync';
--
-- 3. Check recent runs (after waiting for the first execution):
-- SELECT * FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-metrics-sync')
-- ORDER BY start_time DESC LIMIT 5;
--
-- 4. Manually test the endpoint with the correct secret:
-- curl -X POST https://cliptwo.vercel.app/api/metrics/sync/cron \
--   -H "Authorization: Bearer <YOUR_CRON_SECRET>"
