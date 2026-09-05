-- ===========================================================================
-- QUICK FIX: Insert cron secrets + sync lock table
-- ===========================================================================
-- Run this AFTER you have run auto-metrics-sync.sql
-- If auto-metrics-sync.sql already created these, this is idempotent.
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

-- 3. Insert the cron secrets
INSERT INTO app_settings (key, value) VALUES
  ('cron_secret', '463c31fba17fc64ca5dbc84435f80b6298aa3516517a4bc59eddb27843aae838'),
  ('base_url', 'https://cliptwo.vercel.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 4. Verify
SELECT * FROM app_settings;
SELECT * FROM sync_locks;
