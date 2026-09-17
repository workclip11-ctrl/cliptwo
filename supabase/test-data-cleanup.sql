-- ===========================================================================
-- TEST DATA CLEANUP — campaign-assets test data (all generations)
-- ===========================================================================
-- WARNING: This script cleans ALL known test campaigns from all versions of:
--   supabase/campaign-assets-test-setup.sql
--   supabase/campaign-assets-security-tests.sql
--
-- Legacy names (Gen 1):  Asset Test A/B/C/D/F/G/H, E Draft, E Unverified, E Closed
-- Legacy names (Gen 2):  Asset Test A-1/B-1/C-1/D-1/F-1/G-1/H-1, E Draft-1, E Unverified-1, E Closed-1
-- Current names (Gen 3): TA-Private/TB-Private/TC-Private/TD-Private/TE-Draft/TE-Unverified/TE-Closed/TF-Private/TG-Private/TH-Public
--
-- It does NOT touch real user data, real campaigns, or production tables/RLS.
--
-- Storage objects cannot be deleted via SQL (Supabase blocks direct
-- storage.objects DELETE). They must be deleted manually via the
-- Supabase Dashboard Storage UI or the Storage API.
--
-- Run in Supabase SQL Editor (superuser).
-- Step 1: Diagnostic queries (read-only) — review results first.
-- Step 2: Database cleanup (SQL) — campaigns + function only.
-- Step 3: Storage cleanup (manual) — delete objects listed in Step 3.
-- ===========================================================================

-- ===================== STEP 1: DIAGNOSTIC (READ-ONLY) =====================

-- 1a. Find ALL test campaigns (all generations)
SELECT id, title, status, launch_payment_status, created_by, created_at, budget
FROM public.campaigns
WHERE title IN (
  -- Gen 1: original names
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  -- Gen 2: suffixed names
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  -- Gen 3: current names
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
)
ORDER BY title;

-- 1b. Count test campaigns
SELECT count(*) AS test_campaign_count
FROM public.campaigns
WHERE title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1c. Check for clips referencing test campaigns (will CASCADE delete)
SELECT c.id AS clip_id, c.campaign_id, c.clipper, c.status, camp.title
FROM public.clips c
JOIN public.campaigns camp ON camp.id = c.campaign_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1d. Check for financial_records referencing test campaigns (will CASCADE delete)
SELECT fr.id, fr.campaign_id, fr.clip_id, fr.status, camp.title
FROM public.financial_records fr
JOIN public.campaigns camp ON camp.id = fr.campaign_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1e. Check for campaign_launch_payments referencing test campaigns (will CASCADE delete)
SELECT clp.id, clp.campaign_id, clp.payment_status, camp.title
FROM public.campaign_launch_payments clp
JOIN public.campaigns camp ON camp.id = clp.campaign_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1f. Check for clip_metrics referencing test campaigns (will CASCADE delete)
SELECT cm.id, cm.campaign_id, cm.clip_id, cm.platform, camp.title
FROM public.clip_metrics cm
JOIN public.campaigns camp ON camp.id = cm.campaign_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1g. Check for metrics_sync_jobs referencing test campaigns (will CASCADE delete)
SELECT msj.id, msj.campaign_id, msj.clip_id, msj.status, camp.title
FROM public.metrics_sync_jobs msj
JOIN public.campaigns camp ON camp.id = msj.campaign_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 1h. Check for test storage objects
SELECT id, name, owner, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-%'
ORDER BY name;

-- 1i. Count test storage objects
SELECT count(*) AS test_storage_object_count
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-%';

-- 1j. Check if insert_test_storage_object function exists
SELECT p.proname, p.proargtypes::regtype[], p.prosecdef
FROM pg_proc p
WHERE p.proname = 'insert_test_storage_object';

-- 1k. Total campaigns (for reference — should NOT be zero after cleanup)
SELECT count(*) AS total_campaign_count FROM public.campaigns;

-- 1l. Check for any audit_logs referencing test campaign IDs
-- (audit_logs has no FK to campaigns, so these won't CASCADE)
-- NOTE: audit_logs.entity_id is text; join via camp.id::text to avoid UUID cast errors.
SELECT al.id, al.action, al.entity_id, al.timestamp
FROM public.audit_logs al
JOIN public.campaigns camp ON camp.id::text = al.entity_id
WHERE camp.title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
)
ORDER BY al.timestamp DESC
LIMIT 20;


-- ===================== STEP 2: DATABASE CLEANUP (SQL) =====================
-- Run AFTER reviewing Step 1 results.
-- Only deletes test campaigns (cascades to clips, financial_records,
-- campaign_launch_payments, clip_metrics, metrics_sync_jobs) and
-- the test helper function.
-- Storage objects are NOT deleted here — see Step 3.

BEGIN;

-- 2a. Delete test campaigns (cascades to all child tables)
DELETE FROM public.campaigns
WHERE title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- 2b. Drop the test helper function (SECURITY DEFINER, test-only)
DROP FUNCTION IF EXISTS public.insert_test_storage_object(text, uuid);

-- 2c. Verify database cleanup — all should return 0
SELECT count(*) AS remaining_test_campaigns
FROM public.campaigns
WHERE title IN (
  'Asset Test A','Asset Test B','Asset Test C','Asset Test D',
  'Asset Test F','Asset Test G','Asset Test H',
  'E Draft','E Unverified','E Closed',
  'Asset Test A-1','Asset Test B-1','Asset Test C-1','Asset Test D-1',
  'Asset Test F-1','Asset Test G-1','Asset Test H-1',
  'E Draft-1','E Unverified-1','E Closed-1',
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

SELECT count(*) AS remaining_test_function
FROM pg_proc
WHERE proname = 'insert_test_storage_object';

COMMIT;

-- Final: total campaigns after cleanup
SELECT count(*) AS total_campaigns_after_cleanup FROM public.campaigns;


-- ===================== STEP 3: STORAGE CLEANUP (MANUAL) =====================
-- Supabase blocks direct DELETE on storage.objects (storage.protect_delete).
-- Delete these objects manually via:
--   Supabase Dashboard → Storage → campaign-assets → navigate and delete
--   OR use the Supabase Storage API with a service-role key.
--
-- The 10 test storage object paths (derived from campaign-assets-test-setup.sql):
--
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TA-Private-id}/private/test-a.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TB-Private-id}/private/test-b.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TC-Private-id}/private/test-c.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TD-Private-id}/private/test-d.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TE-Draft-id}/private/test-e1.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TE-Unverified-id}/private/test-e2.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TE-Closed-id}/private/test-e3.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TF-Private-id}/private/test-f.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TG-Private-id}/private/test-g.mp4
--   e92427b0-254e-44cc-b2df-be83792c8a94/{TH-Public-id}/test-h-thumb.jpg
--
-- NOTE: Campaign UUIDs ({*-id}) are only known at runtime. After running
-- Step 2a, these campaigns will be deleted, so query Step 1a FIRST to
-- capture the UUIDs before cleanup. Alternatively, search the Storage UI
-- for objects with names containing "test-" in the campaign-assets bucket.
--
-- EASIEST APPROACH: In the Supabase Dashboard, go to Storage → campaign-assets,
-- and delete any folder whose name contains "test-". The test objects are the
-- only ones with "test-" in their path.
