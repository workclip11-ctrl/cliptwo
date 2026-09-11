-- ===========================================================================
-- Campaign Assets Security Regression Tests
-- ===========================================================================
-- Tests private file access security model via SELECT policies.
-- Returns all test results in a single query.
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111
-- ===========================================================================

-- ===================== HELPER FUNCTIONS =====================
CREATE OR REPLACE FUNCTION public.insert_test_storage_object(
  p_name text, p_owner uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', p_name, p_owner, '{}');
END;
$$;

-- SECURITY DEFINER: runs as owner, bypasses RLS for counting
CREATE OR REPLACE FUNCTION public.count_storage_objects(p_like text)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::integer FROM storage.objects
  WHERE bucket_id = 'campaign-assets' AND name LIKE p_like;
$$;

-- ===================== SETUP =====================
-- Cleanup previous runs
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- Disable trigger for clean inserts
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE TRIGGER set_created_by;

-- Create test campaigns + storage objects
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

-- Create storage objects using SECURITY DEFINER helper
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

-- ===================== ALL TESTS (single result) =====================
-- Since RLS is enforced per-transaction and Supabase shows one result,
-- use SECURITY DEFINER count function to verify data, then test RLS
-- by running each role test as a separate statement.

-- Step 1: Verify data setup (all should be 1)
SELECT
  public.count_storage_objects('%/private/test-a.mp4') AS data_a,
  public.count_storage_objects('%/private/test-b.mp4') AS data_b,
  public.count_storage_objects('%/private/test-c.mp4') AS data_c,
  public.count_storage_objects('%/private/test-d.mp4') AS data_d,
  public.count_storage_objects('%/private/test-e1.mp4') AS data_e1,
  public.count_storage_objects('%/private/test-e2.mp4') AS data_e2,
  public.count_storage_objects('%/private/test-e3.mp4') AS data_e3,
  public.count_storage_objects('%/private/test-f.mp4') AS data_f,
  public.count_storage_objects('%/private/test-g.mp4') AS data_g,
  public.count_storage_objects('%/test-h-thumb.jpg') AS data_h;

-- Step 2: Run each RLS test separately (Supabase shows last result only)
-- Copy each block below and run individually in a NEW query tab:

-- >>> TEST A: Creator reads own (expect 1) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_a_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-a.mp4';
ROLLBACK;

-- >>> TEST B: Creator reads OTHER's (expect 0) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_b_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-b.mp4';
ROLLBACK;

-- >>> TEST C: Admin reads private (expect 1) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';
SELECT count(*) AS test_c_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-c.mp4';
ROLLBACK;

-- >>> TEST D: Clipper reads open+verified (expect 1) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_d_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-d.mp4';
ROLLBACK;

-- >>> TEST E: Clipper reads draft/unverified/closed (expect 0) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_e_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-e%.mp4';
ROLLBACK;

-- >>> TEST F: Non-clipper reads open+verified (expect 0) <<<
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_f_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-f.mp4';
ROLLBACK;

-- >>> TEST G: Anonymous reads private (expect 0) <<<
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_g_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-g.mp4';
ROLLBACK;

-- >>> TEST H: Anonymous reads public thumbnail (expect 1) <<<
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_h_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-h-thumb.jpg';
ROLLBACK;

-- ===================== CLEANUP =====================
DROP FUNCTION IF EXISTS public.insert_test_storage_object(text, uuid);
DROP FUNCTION IF EXISTS public.count_storage_objects(text);
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- ===========================================================================
-- EXPECTED RESULTS:
--   data_*: all 1 (data setup confirmed)
--   test_a: 1  (Creator sees own)
--   test_b: 0  (Creator blocked from other's)
--   test_c: 1  (Admin sees all)
--   test_d: 1  (Clipper sees open+verified)
--   test_e: 0  (Clipper blocked from draft/unverified/closed)
--   test_f: 0  (Non-clipper blocked)
--   test_g: 0  (Anonymous blocked from private)
--   test_h: 1  (Anonymous sees public thumbnail)
-- ===========================================================================
