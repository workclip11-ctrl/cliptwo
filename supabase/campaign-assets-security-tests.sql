-- ===========================================================================
-- Campaign Assets Security Regression Tests
-- ===========================================================================
-- Tests the private file access security model via SELECT policies.
-- INSERT uses DO blocks (postgres superuser bypasses INSERT RLS).
-- SELECT uses transaction-level SET LOCAL role (RLS enforced for non-owners).
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111
-- ===========================================================================

-- ===========================================================================
-- TEST A: Creator can read own private campaign asset
-- ===========================================================================
-- Insert as postgres (bypasses RLS)
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TA-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/secret.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Creator A (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_a_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/secret.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST B: Creator cannot read another creator's private asset
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TB-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/secret.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Creator B (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_b_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TB-%/private/secret.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST C: Admin can read private asset
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TC-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/secret.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Admin (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';
SELECT count(*) AS test_c_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TC-%/private/secret.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST D: Clipper can read private asset for open+verified campaign
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TD-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/footage.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Clipper (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_d_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TD-%/private/footage.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST E: Clipper cannot read for draft/unverified/closed campaigns
-- ===========================================================================
DO $$
DECLARE v1 uuid; v2 uuid; v3 uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TE-Draft', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending') RETURNING id INTO v1;
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TE-Unverified', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'pending') RETURNING id INTO v2;
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TE-Closed', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'closed', 'verified') RETURNING id INTO v3;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v1::text || '/private/f.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v2::text || '/private/f.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'),
    ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v3::text || '/private/f.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Clipper (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_e_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TE-%/private/f.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST F: Non-clipper cannot read private asset (even for open+verified)
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TF-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/src.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Creator B (role=creator, not clipper)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_f_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TF-%/private/src.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST G: Anonymous cannot read private asset
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TG-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/private/src.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Read as Anonymous
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_g_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TG-%/private/src.mp4';
ROLLBACK;

-- ===========================================================================
-- TEST H: Public thumbnail still works for all roles
-- ===========================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
  VALUES ('TH-Public', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending')
  RETURNING id INTO v_id;
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES ('campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || v_id::text || '/thumb.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}');
END $$;

-- Creator sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_h_creator FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TH-%/thumb.jpg';
ROLLBACK;

-- Clipper sees thumbnail
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_h_clipper FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TH-%/thumb.jpg';
ROLLBACK;

-- Anonymous sees thumbnail
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_h_anon FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/TH-%/thumb.jpg';
ROLLBACK;

-- ===========================================================================
-- CLEANUP
-- ===========================================================================
DELETE FROM public.campaigns WHERE title LIKE 'T%-Private' OR title LIKE 'T%-Public'
  OR title IN ('TE-Draft', 'TE-Unverified', 'TE-Closed');

-- ===========================================================================
-- EXPECTED RESULTS:
--   test_a: 1 (Creator sees own)
--   test_b: 0 (Creator blocked from other's)
--   test_c: 1 (Admin sees all)
--   test_d: 1 (Clipper sees open+verified)
--   test_e: 0 (Clipper blocked from draft/unverified/closed)
--   test_f: 0 (Non-clipper blocked)
--   test_g: 0 (Anonymous blocked)
--   test_h_creator: 1, test_h_clipper: 1, test_h_anon: 1 (Public thumb works)
-- ===========================================================================
