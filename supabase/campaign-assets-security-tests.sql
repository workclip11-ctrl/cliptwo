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
-- IMPORTANT: All SQL runs at transaction level (outside DO blocks).
-- DO blocks only for variable declarations and assertions.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test A-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test A-1' LIMIT 1) || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS creator_sees_own FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_video.mp4' AND owner = 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid;
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test A-1';

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test B-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test B-1' LIMIT 1) || '/private/brand_guide.pdf', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator B (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS creator_b_blocked FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/brand_guide.pdf';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test B-1';

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test C-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test C-1' LIMIT 1) || '/private/source_footage.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Admin
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';
SELECT count(*) AS admin_sees_all FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_footage.mp4';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test C-1';

-- ===========================================================================
-- TEST D: Clipper can read private asset for open + verified campaign
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test D-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test D-1' LIMIT 1) || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Clipper
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS clipper_sees_verified FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source_video.mp4';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test D-1';

-- ===========================================================================
-- TEST E: Clipper cannot read private asset for draft/unverified/closed
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Draft-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Unverified-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'pending');
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('E Closed-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'closed', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'E Draft-1' LIMIT 1) || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'E Unverified-1' LIMIT 1) || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
  ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'E Closed-1' LIMIT 1) || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Clipper (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS clipper_blocked FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/file.mp4';
ROLLBACK;

DELETE FROM public.campaigns WHERE title IN ('E Draft-1', 'E Unverified-1', 'E Closed-1');

-- ===========================================================================
-- TEST F: Non-clipper user cannot read private asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test F-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test F-1' LIMIT 1) || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Creator B (not clipper)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS non_clipper_blocked FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source.mp4';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test F-1';

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test G-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test G-1' LIMIT 1) || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Step 2: Read as Anonymous
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS anon_blocked FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/source.mp4';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test G-1';

-- ===========================================================================
-- TEST H: Public thumbnail still works for all roles
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('Asset Test H-1', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || (SELECT id::text FROM public.campaigns WHERE title = 'Asset Test H-1' LIMIT 1) || '/thumbnail.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
COMMIT;

-- Creator sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS creator_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
ROLLBACK;

-- Clipper sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS clipper_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
ROLLBACK;

-- Anonymous sees thumbnail
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS anon_sees_thumb FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/thumbnail.jpg';
ROLLBACK;

DELETE FROM public.campaigns WHERE title = 'Asset Test H-1';

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
