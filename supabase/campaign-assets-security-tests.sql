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
--   Creator B: 11111111-1111-1111-1111-111111111111
--
-- IMPORTANT: set_config('role', ...) does NOT change the PostgreSQL role.
-- We must use EXECUTE 'SET LOCAL role = ...' to actually switch roles,
-- otherwise the session user (postgres) bypasses RLS entirely.
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_count int;
  v_file_path text;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test A', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "video/mp4"}');

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 1, 'TEST A FAILED: Creator cannot read own private asset, got ' || v_count;
END $$;
SELECT 'TEST A PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'b0000000-0000-0000-0000-000000000002';
  v_count int;
  v_file_path text;
BEGIN
  -- Act as Creator A to insert
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test B', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/brand_guide.pdf';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "application/pdf"}');

  -- Switch to Creator B
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 0, 'TEST B FAILED: Creator B can see Creator A private asset, got ' || v_count;
END $$;
SELECT 'TEST B PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'c0000000-0000-0000-0000-000000000003';
  v_count int;
  v_file_path text;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test C', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_footage.mp4';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "video/mp4"}');

  -- Switch to Admin
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 1, 'TEST C FAILED: Admin cannot read private asset, got ' || v_count;
END $$;
SELECT 'TEST C PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST D: Clipper can read private asset for open + verified campaign
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'd0000000-0000-0000-0000-000000000004';
  v_count int;
  v_file_path text;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test D', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source_video.mp4';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "video/mp4"}');

  -- Switch to Clipper
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 1, 'TEST D FAILED: Clipper cannot read open+verified campaign asset, got ' || v_count;
END $$;
SELECT 'TEST D PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST E: Clipper cannot read private asset for draft/unverified/closed
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_draft_id uuid;
  v_unverified_id uuid;
  v_closed_id uuid;
  v_count int;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Draft', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_draft_id;

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Unverified', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'pending')
  RETURNING id INTO v_unverified_id;

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('E Closed', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'closed', 'verified')
  RETURNING id INTO v_closed_id;

  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_draft_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_unverified_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_closed_id::text || '/private/file.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');

  -- Switch to Clipper
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_draft_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see draft campaign asset, got ' || v_count;

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_unverified_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see unverified campaign asset, got ' || v_count;

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_closed_id::text || '/private/file.mp4';
  ASSERT v_count = 0, 'TEST E FAILED: Clipper can see closed campaign asset, got ' || v_count;
END $$;
SELECT 'TEST E PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST F: Non-clipper user cannot read private asset
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'f0000000-0000-0000-0000-000000000006';
  v_count int;
  v_file_path text;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test F', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "video/mp4"}');

  -- Switch to Creator B (role=creator, not clipper)
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 0, 'TEST F FAILED: Non-clipper can see private asset, got ' || v_count;
END $$;
SELECT 'TEST F PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'g0000000-0000-0000-0000-000000000007';
  v_count int;
  v_file_path text;
BEGIN
  -- Create as Creator A
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test G', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_campaign_id;

  v_file_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/private/source.mp4';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_file_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "video/mp4"}');

  -- Switch to anonymous
  EXECUTE 'SET LOCAL role = ''anon''';
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);

  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_file_path;
  ASSERT v_count = 0, 'TEST G FAILED: Anonymous can see private asset, got ' || v_count;
END $$;
SELECT 'TEST G PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- TEST H: Public thumbnail still works
-- ===========================================================================
BEGIN;
DO $$
DECLARE
  v_campaign_id uuid := 'h0000000-0000-0000-0000-000000000008';
  v_count int;
  v_thumb_path text;
BEGIN
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}', true);

  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('Asset Test H', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_campaign_id;

  v_thumb_path := 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_campaign_id::text || '/thumbnail.jpg';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', v_thumb_path, 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{"mimetype": "image/jpeg"}');

  -- Creator A sees it
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Creator cannot see public thumbnail, got ' || v_count;

  -- Clipper sees it
  EXECUTE 'SET LOCAL role = ''authenticated''';
  PERFORM set_config('request.jwt.claims', '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}', true);
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Clipper cannot see public thumbnail, got ' || v_count;

  -- Anonymous sees it
  EXECUTE 'SET LOCAL role = ''anon''';
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name = v_thumb_path;
  ASSERT v_count = 1, 'TEST H FAILED: Anonymous cannot see public thumbnail, got ' || v_count;
END $$;
SELECT 'TEST H PASSED' AS result;
ROLLBACK;

-- ===========================================================================
-- ALL TESTS COMPLETE
-- ===========================================================================
