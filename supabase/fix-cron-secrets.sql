-- ===========================================================================
-- QUICK FIX: Insert cron secrets into app_settings
-- ===========================================================================
-- Run this AFTER you have run auto-metrics-sync.sql
-- This replaces the ALTER DATABASE approach that requires superuser.
--
-- The CRON_SECRET must match the value in your Vercel env vars.
-- ===========================================================================

-- Insert or update the settings
INSERT INTO app_settings (key, value) VALUES
  ('cron_secret', '463c31fba17fc64ca5dbc84435f80b6298aa3516517a4bc59eddb27843aae838'),
  ('base_url', 'https://cliptwo.vercel.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Verify it worked
SELECT * FROM app_settings;
