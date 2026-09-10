-- ===========================================================================
-- Campaign Assets Security Regression Tests
-- ===========================================================================
-- Proves the private file access security model:
--   A. Creator can read own private campaign asset
--   B. Creator cannot read another creator's private asset
--   C. Admin can read private asset
--   D. Clipper can read private asset for verified + open campaign
--   E. Clipper cannot read private asset for draft/unverified/closed
--   F. Non-clipper user cannot read private asset
--   G. Anonymous cannot read private asset
--   H. Public thumbnail still works
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111
--
-- IMPORTANT: All INSERT/SELECT must happen at transaction level (outside
-- DO blocks). PL/pgSQL DO blocks run with original caller privileges
-- which bypasses RLS on storage.objects in Supabase.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test A', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_id;
  RAISE NOTICE 'campaign_id=%', v_id;
END $$;

-- Storage INSERT must be outside DO block for RLS to evaluate correctly
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test A')::text || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator A (should see 1 row)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

SELECT count(*) AS creator_sees_own
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_video.mp4' AND owner = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;
-- Expected: 1
ROLLBACK;

-- Cleanup
DELETE FROM public.campaigns WHERE title = 'Asset Test A';

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test B', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test B')::text || '/private/brand_guide.pdf', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator B (should see 0 rows)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

SELECT count(*) AS creator_b_blocked
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/brand_guide.pdf';
-- Expected: 0
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test B';
COMMIT;

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test C', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test C')::text || '/private/source_footage.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Admin (should see 1 row)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';

SELECT count(*) AS admin_sees_all
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_footage.mp4';
-- Expected: 1
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test C';
COMMIT;

-- ===========================================================================
-- TEST D: Clipper can read private asset for open + verified campaign
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test D', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test D')::text || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Clipper (should see 1 row)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

SELECT count(*) AS clipper_sees_verified
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_video.mp4';
-- Expected: 1
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test D';
COMMIT;

-- ===========================================================================
-- TEST E: Clipper cannot read private asset for draft/unverified/closed
-- ===========================================================================
-- Step 1: Insert 3 campaigns as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Draft', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Unverified', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'pending');
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Closed', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'closed', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'E Draft')::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'E Unverified')::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'E Closed')::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Clipper (should see 0 rows)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

SELECT count(*) AS clipper_blocked_draft
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/file.mp4';
-- Expected: 0
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title IN ('E Draft', 'E Unverified', 'E Closed');
COMMIT;

-- ===========================================================================
-- TEST F: Non-clipper user cannot read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A (open+verified campaign)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test F', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test F')::text || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator B (not clipper - should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

SELECT count(*) AS non_clipper_blocked
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source.mp4';
-- Expected: 0
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test F';
COMMIT;

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A (open+verified campaign)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test G', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test G')::text || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Anonymous (should see 0)
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';

SELECT count(*) AS anon_blocked
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source.mp4';
-- Expected: 0
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test G';
COMMIT;

-- ===========================================================================
-- TEST H: Public thumbnail still works for all roles
-- ===========================================================================
-- Step 1: Insert thumbnail as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test H', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id FROM public.campaigns WHERE title = 'Asset Test H')::text || '/thumbnail.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2a: Creator sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS creator_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- Step 2b: Clipper sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS clipper_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- Step 2c: Anonymous sees thumbnail
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS anon_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- Cleanup
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
DELETE FROM public.campaigns WHERE title = 'Asset Test H';
COMMIT;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
