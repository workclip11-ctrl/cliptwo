-- ===========================================================================
-- Campaign Assets Security - Tests
-- ===========================================================================
-- Run campaign-assets-test-setup.sql FIRST, then run each test below
-- in a SEPARATE new query tab. Each test shows running_as + result.
--
-- ===========================================================================

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
