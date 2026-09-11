-- ===========================================================================
-- Campaign Assets Security Regression Tests
-- ===========================================================================
-- Tests private file access security model via SELECT policies.
-- Data setup: RLS + trigger disabled (superuser inserts directly).
-- SELECT tests: RLS enabled, role-switched via SET LOCAL.
--
-- UUIDs:
--   Creator A: e92427b0-254e-44cc-b2df-be83792c8a94
--   Clipper:   fe542ad2-8b40-40ea-8aba-ad8dc63140ce
--   Admin:     f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd
--   Creator B: 11111111-1111-1111-1111-111111111111
-- ===========================================================================

-- ===================== CLEANUP PREVIOUS RUNS =====================
-- Remove leftover campaigns from prior runs (storage objects orphaned automatically)
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- ===================== DATA SETUP (RLS + TRIGGER OFF) =====================
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns DISABLE TRIGGER set_campaign_created_by;

-- TEST A: Creator A's own private asset (should read)
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TA-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-a.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TA-Private';

-- TEST B: Creator A's campaign (Creator B tries to read, should be blocked)
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TB-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-b.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TB-Private';

-- TEST C: Admin reads private asset (should read)
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TC-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'draft', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-c.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TC-Private';

-- TEST D: Clipper reads open+verified (should read)
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TD-Private', 'Brief', 'YouTube', 50, 'Creator A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 1000::numeric, 'open', 'verified');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-d.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TD-Private';

-- TEST E: Clipper blocked from draft/unverified/closed
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TE-Draft', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e1.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TE-Draft';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TE-Unverified', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e2.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TE-Unverified';

INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TE-Closed', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'closed', 'verified');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-e3.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TE-Closed';

-- TEST F: Non-clipper blocked from open+verified
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TF-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-f.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TF-Private';

-- TEST G: Anonymous blocked from open+verified
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TG-Private', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'open', 'verified');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/private/test-g.mp4', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TG-Private';

-- TEST H: Public thumbnail readable by all
INSERT INTO public.campaigns (title, brief, platform, payout, creator, created_by, budget, status, launch_payment_status)
VALUES ('TH-Public', 'B', 'YouTube', 50, 'A', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, 100, 'draft', 'pending');
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT 'campaign-assets', 'e92427b0-254e-44cc-b2df-be83792c8a94/' || id::text || '/test-h-thumb.jpg', 'e92427b0-254e-44cc-b2df-be83792c8a94'::uuid, '{}'
FROM public.campaigns WHERE title = 'TH-Public';

-- ===================== RE-ENABLE SECURITY =====================
ALTER TABLE public.campaigns ENABLE TRIGGER set_campaign_created_by;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ===================== SELECT TESTS (RLS ON) =====================

-- TEST A: Creator can read own private asset (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_a_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-a.mp4';
ROLLBACK;

-- TEST B: Creator cannot read another's private asset (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_b_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-b.mp4';
ROLLBACK;

-- TEST C: Admin can read private asset (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "f1d9d01c-c205-440c-9bde-8f7a6ea7d2fd", "role": "authenticated"}';
SELECT count(*) AS test_c_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-c.mp4';
ROLLBACK;

-- TEST D: Clipper can read open+verified private asset (should see 1)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_d_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-d.mp4';
ROLLBACK;

-- TEST E: Clipper blocked from draft/unverified/closed (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_e_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-e%.mp4';
ROLLBACK;

-- TEST F: Non-clipper blocked from private asset (should see 0)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
SELECT count(*) AS test_f_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-f.mp4';
ROLLBACK;

-- TEST G: Anonymous blocked from private asset (should see 0)
BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_g_result FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/private/test-g.mp4';
ROLLBACK;

-- TEST H: Public thumbnail readable by all (should see 1 each)
BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "e92427b0-254e-44cc-b2df-be83792c8a94", "role": "authenticated"}';
SELECT count(*) AS test_h_creator FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-h-thumb.jpg';
ROLLBACK;

BEGIN;
SET LOCAL role = 'authenticated';
SET LOCAL request.jwt.claims = '{"sub": "fe542ad2-8b40-40ea-8aba-ad8dc63140ce", "role": "authenticated"}';
SELECT count(*) AS test_h_clipper FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-h-thumb.jpg';
ROLLBACK;

BEGIN;
SET LOCAL role = 'anon';
SET LOCAL request.jwt.claims = '{"role": "anon"}';
SELECT count(*) AS test_h_anon FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-h-thumb.jpg';
ROLLBACK;

-- ===================== CLEANUP =====================
DELETE FROM public.campaigns WHERE title IN (
  'TA-Private','TB-Private','TC-Private','TD-Private',
  'TE-Draft','TE-Unverified','TE-Closed',
  'TF-Private','TG-Private','TH-Public'
);

-- ===========================================================================
-- EXPECTED RESULTS:
--   test_a: 1  (Creator sees own)
--   test_b: 0  (Creator blocked from other's)
--   test_c: 1  (Admin sees all)
--   test_d: 1  (Clipper sees open+verified)
--   test_e: 0  (Clipper blocked from draft/unverified/closed)
--   test_f: 0  (Non-clipper blocked)
--   test_g: 0  (Anonymous blocked)
--   test_h_creator: 1, test_h_clipper: 1, test_h_anon: 1 (Public thumb works)
-- ===========================================================================
