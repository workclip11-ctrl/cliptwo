-- ===========================================================================
-- DELETE 5 SPECIFIC TEST CAMPAIGNS
-- ===========================================================================
-- Run in Supabase SQL Editor (superuser).
-- Step 1: Verify the 5 UUIDs exist and check for other campaigns.
-- Step 2: Delete ONLY these 5 UUIDs.
-- Step 3: Verify deletion.
-- ===========================================================================

-- ===================== STEP 1: VERIFY (READ-ONLY) =====================

-- 1a. Verify the 5 target campaigns exist
SELECT id, title, status, launch_payment_status, created_by, creator, budget, created_at
FROM public.campaigns
WHERE id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
)
ORDER BY title;

-- 1b. Verify all 5 have created_by = test user
SELECT id, title, created_by,
  CASE WHEN created_by = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid
    THEN 'YES - test user' ELSE 'NO - DIFFERENT USER' END AS is_test_user
FROM public.campaigns
WHERE id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1c. Check ALL campaigns (are there any others?)
SELECT id, title, status, created_by, budget
FROM public.campaigns
ORDER BY created_at;

-- 1d. Count total campaigns
SELECT count(*) AS total_campaign_count FROM public.campaigns;

-- 1e. Check clips referencing these 5 campaigns (will CASCADE delete)
SELECT c.id AS clip_id, c.campaign_id, c.clipper, c.status, c.views
FROM public.clips c
WHERE c.campaign_id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1f. Check financial_records referencing these 5 campaigns (will CASCADE delete)
SELECT fr.id, fr.campaign_id, fr.clip_id, fr.status, fr.net_amount
FROM public.financial_records fr
WHERE fr.campaign_id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1g. Check campaign_launch_payments (will CASCADE delete)
SELECT clp.id, clp.campaign_id, clp.payment_status, clp.total_payable_paise
FROM public.campaign_launch_payments clp
WHERE clp.campaign_id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1h. Check clip_metrics (will CASCADE delete)
SELECT cm.id, cm.campaign_id, cm.clip_id, cm.platform, cm.views
FROM public.clip_metrics cm
WHERE cm.campaign_id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1i. Check metrics_sync_jobs (will CASCADE delete)
SELECT msj.id, msj.campaign_id, msj.clip_id, msj.status
FROM public.metrics_sync_jobs msj
WHERE msj.campaign_id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- 1j. Check storage.objects for these campaigns
-- (Search for paths containing the campaign UUIDs)
SELECT id, name, owner, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'campaign-assets'
  AND (
    name LIKE '%f6a51e97-fb37-42f5-a791-6c05e14fb6eb%'
    OR name LIKE '%129571a0-5d87-44ce-9126-6e97b14795c5%'
    OR name LIKE '%acd1af8a-b791-49b2-be8e-9419241f7820%'
    OR name LIKE '%2dbf05dd-d8e8-45e9-a6f5-737d640e0c55%'
    OR name LIKE '%d6c6a743-90a1-4fde-b014-70c433a41970%'
  )
ORDER BY name;


-- ===================== STEP 2: DELETE (DESTRUCTIVE) =====================
-- Only run AFTER reviewing Step 1 results.
-- Deletes ONLY the 5 specified campaign UUIDs.
-- All child records (clips, financial_records, etc.) cascade automatically.

BEGIN;

DELETE FROM public.campaigns
WHERE id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

-- Report how many were deleted
SELECT 5 - count(*) AS campaigns_deleted
FROM public.campaigns
WHERE id IN (
  'f6a51e97-fb37-42f5-a791-6c05e14fb6eb',
  '129571a0-5d87-44ce-9126-6e97b14795c5',
  'acd1af8a-b791-49b2-be8e-9419241f7820',
  '2dbf05dd-d8e8-45e9-a6f5-737d640e0c55',
  'd6c6a743-90a1-4fde-b014-70c433a41970'
);

COMMIT;


-- ===================== STEP 3: VERIFY (READ-ONLY) =====================

-- 3a. Total campaigns should be 0
SELECT count(*) AS total_campaigns_after_delete FROM public.campaigns;

-- 3b. No campaign rows should remain
SELECT id, title FROM public.campaigns LIMIT 5;

-- 3c. No clips should remain (all were test clips on test campaigns)
SELECT count(*) AS remaining_clips FROM public.clips;

-- 3d. No financial_records should remain
SELECT count(*) AS remaining_financial_records FROM public.financial_records;

-- 3e. No campaign_launch_payments should remain
SELECT count(*) AS remaining_campaign_launch_payments FROM public.campaign_launch_payments;

-- 3f. No clip_metrics should remain
SELECT count(*) AS remaining_clip_metrics FROM public.clip_metrics;

-- 3g. No metrics_sync_jobs should remain
SELECT count(*) AS remaining_metrics_sync_jobs FROM public.metrics_sync_jobs;

-- 3h. Storage objects: check what remains (delete manually via Dashboard)
SELECT id, name, bucket_id
FROM storage.objects
WHERE bucket_id = 'campaign-assets'
ORDER BY name;
