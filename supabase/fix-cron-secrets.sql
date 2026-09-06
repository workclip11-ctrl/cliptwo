-- ===========================================================================
-- QUICK FIX: Create sync lock infrastructure
-- ===========================================================================
-- Run this AFTER you have run auto-metrics-sync.sql
-- If auto-metrics-sync.sql already created these, this is idempotent.
--
-- CRON_SECRET CONFIGURATION (do NOT hardcode secrets in this file):
--
--   After running this migration, configure your cron secret via the
--   Supabase SQL Editor (Dashboard → SQL Editor):
--
--   INSERT INTO app_settings (key, value)
--   VALUES ('cron_secret', 'YOUR_SECRET_HERE'), ('base_url', 'https://cliptwo.vercel.app')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
--   Use the SAME value as your Vercel CRON_SECRET environment variable.
--   This is the ONLY place the secret is configured — it lives in the
--   database, not in Git.
-- ===========================================================================

-- 1. Create sync_locks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.sync_locks (
  lock_key    text PRIMARY KEY,
  owner_id    uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

GRANT ALL ON public.sync_locks TO service_role;

-- 2. Create lock functions if they don't exist
CREATE OR REPLACE FUNCTION public.acquire_sync_lock(
  p_lock_key text,
  p_owner_id uuid,
  p_ttl_seconds integer DEFAULT 600
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sync_locks
  WHERE lock_key = p_lock_key AND expires_at <= now();

  BEGIN
    INSERT INTO public.sync_locks (lock_key, owner_id, acquired_at, expires_at)
    VALUES (p_lock_key, p_owner_id, now(), now() + make_interval(secs => p_ttl_seconds));
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock(
  p_lock_key text,
  p_owner_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sync_locks
  WHERE lock_key = p_lock_key AND owner_id = p_owner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_sync_lock(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(text, uuid) TO service_role;

-- Renew function (heartbeat for long-running syncs)
CREATE OR REPLACE FUNCTION public.renew_sync_lock(
  p_lock_key text,
  p_owner_id uuid,
  p_ttl_seconds integer DEFAULT 600
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.sync_locks
  SET expires_at = now() + make_interval(secs => p_ttl_seconds)
  WHERE lock_key = p_lock_key
    AND owner_id = p_owner_id
    AND expires_at > now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_sync_lock(text, uuid, integer) TO service_role;

-- 3. Verify
-- After running, configure your cron secret via the Supabase SQL Editor:
--   INSERT INTO app_settings (key, value)
--   VALUES ('cron_secret', 'YOUR_SECRET_HERE'), ('base_url', 'https://cliptwo.vercel.app')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
SELECT * FROM app_settings;
SELECT * FROM sync_locks;
