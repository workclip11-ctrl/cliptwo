-- ===========================================================================
-- AUTO METRICS SYNC — pg_cron + pg_net
-- ===========================================================================
-- This migration sets up automatic background metrics syncing every 30 minutes.
--
-- PREREQUISITES (run in Supabase Dashboard → SQL Editor):
--   1. Enable pg_cron:   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   2. Enable pg_net:    CREATE EXTENSION IF NOT EXISTS pg_net;
--   3. Set the cron secret:
--      ALTER DATABASE postgres SET app.settings.cron_secret = '<your-CRON_SECRET>';
--      (Use the same CRON_SECRET from your Vercel env vars)
--
-- The scheduled job calls the existing Vercel cron endpoint which handles:
--   - Finding all eligible approved clips
--   - Token refresh
--   - YouTube ownership verification
--   - ingest_clip_metrics() persistence
--   - Earning finalization
-- ===========================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Schedule automatic metrics sync every 30 minutes
--    Uses net.http_post() to call the Vercel API endpoint.
--    The endpoint authenticates via CRON_SECRET Bearer token.
SELECT cron.schedule(
  'auto-metrics-sync',           -- unique job name
  '*/30 * * * *',                -- every 30 minutes
  $$
    SELECT net.http_post(
      url    := current_setting('app.settings.base_url', true) || '/api/metrics/sync/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 3. Verify the job is scheduled (optional — for manual inspection)
-- SELECT * FROM cron.job WHERE jobname = 'auto-metrics-sync';
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;

-- ===========================================================================
-- ADMIN MANUAL SYNC LOCK (advisory lock to prevent overlapping manual syncs)
-- ===========================================================================
-- This function acquires a session-level advisory lock to prevent
-- multiple simultaneous admin-triggered syncs.
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
