-- ===========================================================================
-- AUTO METRICS SYNC — pg_cron + pg_net
-- ===========================================================================
-- This migration sets up automatic background metrics syncing every 30 minutes.
--
-- SETUP:
--   1. Enable pg_cron:  CREATE EXTENSION IF NOT EXISTS pg_cron;
--   2. Enable pg_net:   CREATE EXTENSION IF NOT EXISTS pg_net;
--   3. Run this entire migration.
--   4. After deploying, insert your secrets into app_settings:
--
--      INSERT INTO app_settings (key, value)
--      VALUES ('cron_secret', 'YOUR_CRON_SECRET'), ('base_url', 'https://cliptwo.vercel.app')
--      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
--      Use the SAME CRON_SECRET value as your Vercel env var.
--      These settings are stored in a database table (not ALTER DATABASE)
--      so they work within Supabase's permission model.
-- ===========================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. App settings table (replaces ALTER DATABASE ... SET which requires superuser)
--    Stores key-value pairs for server-side configuration.
--    RLS is disabled — only service_role reads these via pg_cron (no browser access).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- Seed with default values (override after deployment via SQL)
INSERT INTO public.app_settings (key, value) VALUES
  ('cron_secret', ''),
  ('base_url', 'https://cliptwo.vercel.app')
ON CONFLICT (key) DO NOTHING;

-- Grant read to service_role (pg_cron runs with service_role privileges)
GRANT SELECT ON public.app_settings TO service_role;

-- 3. Remove old job if it exists (from previous broken migration)
SELECT cron.unschedule('auto-metrics-sync');

-- 4. Schedule automatic metrics sync every 30 minutes
--    Uses net.http_post() to call the Vercel API endpoint.
--    Reads cron_secret and base_url from app_settings table at runtime.
SELECT cron.schedule(
  'auto-metrics-sync',           -- unique job name
  '*/30 * * * *',                -- every 30 minutes
  $$
    SELECT net.http_post(
      url    := (SELECT value FROM public.app_settings WHERE key = 'base_url') || '/api/metrics/sync/cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM public.app_settings WHERE key = 'cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- 5. Verify the job is scheduled (optional — for manual inspection)
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
-- AFTER DEPLOYMENT — Run these to configure your secrets
-- ===========================================================================
-- Replace '<YOUR_CRON_SECRET>' with the same value as your Vercel CRON_SECRET env var.
--
--   INSERT INTO app_settings (key, value)
--   VALUES ('cron_secret', '<YOUR_CRON_SECRET>'), ('base_url', 'https://cliptwo.vercel.app')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- Verify configuration:
--   SELECT * FROM app_settings;
--   SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'auto-metrics-sync';
--
-- Check recent runs (after waiting ~30 minutes):
--   SELECT * FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-metrics-sync')
--   ORDER BY start_time DESC LIMIT 5;
--
-- Manually test the endpoint:
--   curl -X POST https://cliptwo.vercel.app/api/metrics/sync/cron \
--     -H "Authorization: Bearer <YOUR_CRON_SECRET>"
