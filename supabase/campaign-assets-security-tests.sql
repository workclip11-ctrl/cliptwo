-- ===========================================================================
-- Campaign Assets Security Regression Tests
-- ===========================================================================
-- Tests private file access security model via SELECT policies.
-- Run the SETUP section first, then run each test in a NEW query tab.
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111
-- ===========================================================================

-- ===================== STEP 1: RUN campaign-assets-security.sql FIRST =====================

-- ===================== STEP 2: SETUP DATA =====================
-- Cleanup previous test data
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- Disable trigger for clean inserts
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE TRIGGER set_created_by;

-- Insert test campaigns
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status) VALUES
  ('TA-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000, 'draft', 'pending'),
  ('TB-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000, 'draft', 'pending'),
  ('TC-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000, 'draft', 'pending'),
  ('TD-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000, 'open', 'verified'),
  ('TE-Draft', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending'),
  ('TE-Unverified', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'pending'),
  ('TE-Closed', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'closed', 'verified'),
  ('TF-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified'),
  ('TG-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified'),
  ('TH-Public', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending');

-- Create SECURITY DEFINER helper for storage inserts
CREATE OR REPLACE FUNCTION public.insert_test_storage_object(
  p_name text, p_owner uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', p_name, p_owner, '{}');
END;
$$;

-- Insert storage objects
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-a.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TA-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-b.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TB-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-c.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TC-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-d.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TD-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e1.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TE-Draft';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e2.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TE-Unverified';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e3.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TE-Closed';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-f.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TF-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-g.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TG-Private';
SELECT public.insert_test_storage_object('e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/test-h-thumb.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid) FROM public.campaigns WHERE title = 'TH-Public';

-- Re-enable security
ALTER TABLE public.campaigns ENABLE TRIGGER set_created_by;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Verify setup: all should be 1
SELECT count(*) AS total_objects FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-%';

-- ===================== STEP 3: RUN TESTS IN NEW TABS =====================
-- Copy each block below into a SEPARATE new query tab and run it.
-- Check the Results panel for each.

-- ======================== TEST A (expect 1) ========================
-- Creator A reads own private asset
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-a.mp4';
ROLLBACK;

-- ======================== TEST B (expect 0) ========================
-- Creator B reads Creator A's private asset
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-b.mp4';
ROLLBACK;

-- ======================== TEST C (expect 1) ========================
-- Admin reads private asset
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-c.mp4';
ROLLBACK;

-- ======================== TEST D (expect 1) ========================
-- Clipper reads open+verified private asset
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-d.mp4';
ROLLBACK;

-- ======================== TEST E (expect 0) ========================
-- Clipper reads draft/unverified/closed private assets
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-e%.mp4';
ROLLBACK;

-- ======================== TEST F (expect 0) ========================
-- Creator B (non-clipper) reads open+verified private asset
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-f.mp4';
ROLLBACK;

-- ======================== TEST G (expect 0) ========================
-- Anonymous reads private asset
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-g.mp4';
ROLLBACK;

-- ======================== TEST H (expect 1) ========================
-- Anonymous reads public thumbnail
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT current_user AS running_as, count(*) AS result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-h-thumb.jpg';
ROLLBACK;

-- ===================== CLEANUP =====================
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);
