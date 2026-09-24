-- ===========================================================================
-- MIGRATION 20250101000009: Production cron base_url
-- ===========================================================================
-- WHAT:
--   Updates public.app_settings so the pg_cron 'auto-metrics-sync' job posts
--   to the live production domain:
--
--     old: https://cliptwo.vercel.app
--     new: https://cliptwo.in
--
-- WHY THIS IS THE AUTHORITATIVE FIX:
--   The scheduled job does NOT bake the URL in at schedule time. Its body
--   reads app_settings on every run (see supabase/auto-metrics-sync.sql):
--
--     url := (SELECT value FROM public.app_settings WHERE key = 'base_url')
--            || '/api/metrics/sync/cron'
--
--   So updating this single row redirects the next run. No reschedule and no
--   change to cron.schedule() is required.
--
-- SCOPE / SECURITY:
--   * Touches ONLY the 'base_url' row (INSERT ... ON CONFLICT (key) DO UPDATE).
--   * cron_secret is intentionally NOT read, printed, replaced, or
--     hard-coded anywhere in this file. It stays as-is in the database.
--   * Idempotent — safe to re-run.
--   * Repository migration only. This file has NOT been executed against
--     production Supabase; production execution is a separate operator step.
--
-- RUN ORDER: after supabase/auto-metrics-sync.sql (creates app_settings).
-- ===========================================================================

-- Ensure the settings table exists (no-op if auto-metrics-sync.sql already ran)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

-- pg_cron reads these settings with service_role privileges
GRANT SELECT ON public.app_settings TO service_role;

-- AUTHORITATIVE production base URL for automatic metrics sync
INSERT INTO public.app_settings AS settings (key, value)
VALUES ('base_url', 'https://cliptwo.in')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value
WHERE settings.key = 'base_url';

-- ===========================================================================
-- VERIFICATION — run manually AFTER applying (safe to share; never SELECT
-- the cron_secret value):
--
--   SELECT key, value FROM public.app_settings WHERE key = 'base_url';
--   -- expect exactly one row: base_url = https://cliptwo.in
--
--   SELECT value = 'https://cliptwo.in' AS base_url_ok
--   FROM public.app_settings WHERE key = 'base_url';
--
--   -- Job still scheduled + reading base_url at runtime:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname = 'auto-metrics-sync';
--
--   -- IMPORTANT: 'succeeded' in job_run_details only means the job body ran
--   -- (net.http_post does not fail the job on HTTP 4xx/5xx). Check the
--   -- actual HTTP outcome of recent runs before claiming sync works:
--   SELECT jobid, status, return_message, start_time
--   FROM cron.job_run_details
--   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-metrics-sync')
--   ORDER BY start_time DESC LIMIT 5;
--
--   -- Manual endpoint test (use the real CRON_SECRET from your environment;
--   -- never commit it):
--   curl -X POST https://cliptwo.in/api/metrics/sync/cron \
--     -H "Authorization: Bearer $CRON_SECRET"
-- ===========================================================================
