-- ===========================================================================
-- Campaign Assets Security Regression Tests (Phase 4 Final Fix)
-- ===========================================================================
-- Proves the private file access security model:
--   A. Creator can read own private campaign asset
--   B. Creator cannot read another creator's private asset
--   C. Admin can read private asset
--   D. Clipper can read private asset for verified + open campaign
--   E. Clipper cannot read private asset for draft/unverified/closed campaign
--   F. Another authenticated non-clipper user cannot read private asset
--   G. Anonymous cannot read private asset
--   H. Public thumbnail still works
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111 (created in TEST B)
--
-- Path convention:
--   Public:  {user_id}/{campaign_id}/{filename}        (thumbnails)
--   Private: {user_id}/{campaign_id}/private/{filename} (source, brand)
--
-- HOW TO RUN: Execute each test block individually in Supabase SQL Editor.
-- Each test is wrapped in BEGIN/ROLLBACK — no data is persisted.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
-- Setup: Insert a private storage object owned by Creator A
-- Action: Creator A queries storage.objects
-- Expected: 1 row returned (own file visible)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_count int;
BEGIN
  -- Create campaign as Creator A
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test A', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Insert a private storage object (simulates uploaded source footage)
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "video/mp4"}'
  );

  -- Creator A should see their own private file
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';

  ASSERT v_count = 1, 'TEST A FAILED: Creator cannot read own private asset, got ' || v_count;

  -- Cleanup
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
-- Setup: Creator A inserts a private file. Creator B queries it.
-- Expected: 0 rows returned (cross-creator file invisible)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'b0000000-0000-0000-0000-000000000002';
  v_count int;
BEGIN
  -- Create campaign as Creator A
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test B', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Insert a private storage object owned by Creator A
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/brand_guide.pdf',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "application/pdf"}'
  );

  -- Switch to Creator B (different user)
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Creator B should NOT see Creator A's private file
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/brand_guide.pdf';

  ASSERT v_count = 0, 'TEST B FAILED: Creator B can see Creator A private asset, got ' || v_count;

  -- Cleanup (switch back to Creator A)
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/brand_guide.pdf';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
-- Setup: Creator A inserts a private file. Admin queries it.
-- Expected: 1 row returned (admin sees all)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000003';
  v_count int;
BEGIN
  -- Create campaign as Creator A
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test C', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Insert a private storage object
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_footage.mp4',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "video/mp4"}'
  );

  -- Switch to Admin
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Admin should see all private files
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_footage.mp4';

  ASSERT v_count = 1, 'TEST C FAILED: Admin cannot read private asset, got ' || v_count;

  -- Cleanup (switch back to Creator A)
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_footage.mp4';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Clipper can read private asset for open + verified campaign
-- ===========================================================================
-- Setup: Creator A creates open+verified campaign, inserts private file.
--        Clipper queries it.
-- Expected: 1 row returned (clipper sees open+verified campaign assets)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'd0000000-0000-0000-0000-000000000004';
  v_count int;
BEGIN
  -- Create open+verified campaign as Creator A
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test D', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'open', 'verified'
  ) RETURNING id INTO v_campaign_id;

  -- Insert a private storage object
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "video/mp4"}'
  );

  -- Switch to Clipper
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Clipper should see private files for open+verified campaigns
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';

  ASSERT v_count = 1, 'TEST D FAILED: Clipper cannot read open+verified campaign asset, got ' || v_count;

  -- Cleanup (switch back to Creator A)
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Clipper cannot read private asset for draft/unverified/closed campaign
-- ===========================================================================
-- Setup: Creator A creates 3 campaigns (draft, unverified, closed), each with private files.
--        Clipper queries each.
-- Expected: 0 rows returned for all 3
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_draft_id uuid;
  v_unverified_id uuid;
  v_closed_id uuid;
  v_count int;
BEGIN
  -- Draft campaign (status=draft, payment=pending)
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test E Draft', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_draft_id;

  -- Unverified campaign (status=open, payment=pending)
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test E Unverified', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'open', 'pending'
  ) RETURNING id INTO v_unverified_id;

  -- Closed campaign (status=closed, payment=verified)
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test E Closed', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'closed', 'verified'
  ) RETURNING id INTO v_closed_id;

  -- Insert private files for each
  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_draft_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_unverified_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_closed_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');

  -- Switch to Clipper
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Clipper should NOT see draft campaign private file
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_draft_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see draft campaign asset, got ' || v_count;

  -- Clipper should NOT see unverified campaign private file
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_unverified_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see unverified campaign asset, got ' || v_count;

  -- Clipper should NOT see closed campaign private file
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_closed_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see closed campaign asset, got ' || v_count;

  -- Cleanup (switch back to Creator A)
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE 'e92427b0-254e-44cc-b2df-be83792c8a94/%/private/file.mp4';
  DELETE FROM public.campaigns WHERE id IN (v_draft_id, v_unverified_id, v_closed_id);
END $$;

SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Another authenticated non-clipper user cannot read private asset
-- ===========================================================================
-- Setup: Creator A creates open+verified campaign with private file.
--        A user with role='creator' (not clipper) queries it.
-- Expected: 0 rows returned
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'f0000000-0000-0000-0000-000000000006';
  v_count int;
BEGIN
  -- Create open+verified campaign
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test F', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'open', 'verified'
  ) RETURNING id INTO v_campaign_id;

  -- Insert private file
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "video/mp4"}'
  );

  -- Switch to a creator-role user (not clipper, not admin, not owner)
  -- This user has role='creator' in profiles, so the clipper condition fails
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Non-clipper should NOT see private files (even for open+verified campaigns)
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';

  ASSERT v_count = 0, 'TEST F FAILED: Non-clipper can see private asset, got ' || v_count;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
-- Setup: Creator A creates open+verified campaign with private file.
--        Anonymous user queries it.
-- Expected: 0 rows returned (anon gets no private files)
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';

DO $$
DECLARE
  v_campaign_id uuid := 'g0000000-0000-0000-0000-000000000007';
  v_count int;
BEGIN
  -- Create open+verified campaign (as Creator A first)
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test G', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'open', 'verified'
  ) RETURNING id INTO v_campaign_id;

  -- Insert private file
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "video/mp4"}'
  );

  -- Switch to anonymous
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('role', 'anon', true);

  -- Anonymous should NOT see private files
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';

  ASSERT v_count = 0, 'TEST G FAILED: Anonymous can see private asset, got ' || v_count;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects
  WHERE bucket_id = 'campaign-assets'
    AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Public thumbnail still works
-- ===========================================================================
-- Setup: Creator A inserts a public (3-part) thumbnail file.
--        Anonymous, clipper, and creator all query it.
-- Expected: All 3 see the thumbnail (public path = world-readable)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';

DO $$
DECLARE
  v_campaign_id uuid := 'h0000000-0000-0000-0000-000000000008';
  v_count int;
  v_thumb_path text;
BEGIN
  -- Create campaign
  INSERT INTO public.campaigns (
    title, brief, platform, payout, creator, created_by,
    budget, status, launch_payment_status
  ) VALUES (
    'Asset Test H', 'Brief', 'YouTube', 50, 'Creator A',
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    1000::numeric, 'draft', 'pending'
  ) RETURNING id INTO v_campaign_id;

  -- Insert public thumbnail (3-part path)
  v_thumb_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/thumbnail.jpg';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'campaign-assets',
    v_thumb_path,
    'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid,
    '{"mimetype": "image/jpeg"}'
  );

  -- Creator A can see public thumbnail
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Creator cannot see public thumbnail, got ' || v_count;

  -- Clipper can see public thumbnail
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Clipper cannot see public thumbnail, got ' || v_count;

  -- Anonymous can see public thumbnail
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  PERFORM set_config('role', 'anon', true);
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Anonymous cannot see public thumbnail, got ' || v_count;

  -- Cleanup
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);
  DELETE FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  DELETE FROM public.campaigns WHERE id = v_campaign_id;
END $$;

SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
