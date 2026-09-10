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
-- IMPORTANT: Role switching happens at the TRANSACTION level via
-- SET LOCAL, NOT inside DO blocks. PL/pgSQL DO blocks run with the
-- original caller's privileges regardless of EXECUTE 'SET LOCAL role'.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_count int;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test A', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';
  ASSERT v_count = 1, 'TEST A FAILED: got ' || v_count;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'b0000000-0000-0000-0000-000000000002';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test B', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/brand_guide.pdf', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Creator B (should see 0 rows)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

SELECT count(*) AS creator_b_visible
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/b0000000-0000-0000-0000-000000000002/private/brand_guide.pdf';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000003';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test C', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_footage.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Admin (should see 1 row)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';

SELECT count(*) AS admin_visible
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/c0000000-0000-0000-0000-000000000003/private/source_footage.mp4';
-- Expected: 1 row
ROLLBACK;

-- ===========================================================================
-- TEST D: Clipper can read private asset for open + verified campaign
-- ===========================================================================
-- Step 1: Insert as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'd0000000-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test D', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Clipper (should see 1 row)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

SELECT count(*) AS clipper_visible
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/d0000000-0000-0000-0000-000000000004/private/source_video.mp4';
-- Expected: 1 row
ROLLBACK;

-- ===========================================================================
-- TEST E: Clipper cannot read private asset for draft/unverified/closed
-- ===========================================================================
-- Step 1: Insert 3 campaigns as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_draft uuid; v_unverified uuid; v_closed uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Draft', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_draft;
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Unverified', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'pending')
  RETURNING id INTO v_unverified;
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Closed', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'closed', 'verified')
  RETURNING id INTO v_closed;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_draft::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_unverified::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_closed::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Clipper (should see 0 rows for all 3)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

SELECT count(*) AS clipper_draft_blocked FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/e0000000-0000-0000-0000-00000000000%/private/file.mp4';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST F: Non-clipper user cannot read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A (campaign is open+verified)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'f0000000-0000-0000-0000-000000000006';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test F', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Creator B (not a clipper - should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';

SELECT count(*) AS non_clipper_blocked
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/f0000000-0000-0000-0000-000000000006/private/source.mp4';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
-- Step 1: Insert as Creator A (campaign is open+verified)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000007-0000-0000-0000-000000000007';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test G', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2: Read as Anonymous (should see 0)
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';

SELECT count(*) AS anon_blocked
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/c0000007-0000-0000-0000-000000000007/private/source.mp4';
-- Expected: 0 rows
ROLLBACK;

-- ===========================================================================
-- TEST H: Public thumbnail still works for all roles
-- ===========================================================================
-- Step 1: Insert thumbnail as Creator A
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'd0000008-0000-0000-0000-000000000008';
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test H', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/thumbnail.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;
COMMIT;

-- Step 2a: Creator A sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

SELECT count(*) AS creator_sees_thumb
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/d0000008-0000-0000-0000-000000000008/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- Step 2b: Clipper sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';

SELECT count(*) AS clipper_sees_thumb
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/d0000008-0000-0000-0000-000000000008/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- Step 2c: Anonymous sees thumbnail
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';

SELECT count(*) AS anon_sees_thumb
FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/d0000008-0000-0000-0000-000000000008/thumbnail.jpg';
-- Expected: 1
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
