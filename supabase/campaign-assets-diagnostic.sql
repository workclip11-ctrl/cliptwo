-- ===========================================================================
-- Campaign Assets Diagnostic Queries
-- ===========================================================================
-- Use these queries to inspect storage state. All run as superuser (SQL Editor).

-- 1. Check what policies actually exist on storage.objects
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- 2. Check if bucket is actually private
SELECT id, name, public FROM storage.buckets WHERE id = 'campaign-assets';

-- 3. Check all test objects and their foldername depth
-- NOTE: storage.foldername() EXCLUDES the filename.
--   3-segment path (private): user/campaign/private/file → foldername length 3
--   2-segment path (public):  user/campaign/file         → foldername length 2
SELECT name,
       array_length(storage.foldername(name), 1) AS folder_depth,
       storage.foldername(name) AS parts
FROM storage.objects
WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-%'
ORDER BY name;

-- 4. =========================================================================
-- LEGACY SOURCE FILE DIAGNOSTIC
-- =========================================================================
-- The current upload implementation (src/lib/upload.ts) always puts source
-- footage under the private/ prefix:
--   Private: {user_id}/{campaign_id}/private/{filename}
--   Public:  {user_id}/{campaign_id}/{filename}
--
-- However, older versions of the code may have uploaded source footage
-- to the public 3-segment path (without /private/). These files would be
-- publicly readable via the public SELECT policy.
--
-- The query below identifies CANDIDATE legacy source files: objects in the
-- campaign-assets bucket that:
--   1. Are at the 2-segment (public) path depth
--   2. Have file extensions typical of video/source files (not thumbnails)
--
-- IMPORTANT: This is a DIAGNOSTIC query only. Do NOT auto-delete or migrate.
-- Review results manually before taking any action.
SELECT name,
       storage.foldername(name) AS path_parts,
       array_length(storage.foldername(name), 1) AS depth
FROM storage.objects
WHERE bucket_id = 'campaign-assets'
  AND array_length(storage.foldername(name), 1) = 2
  AND name ~* '\.(mp4|mov|avi|mkv|webm|wmv|flv|m4v|mpg|mpeg)$'
ORDER BY created_at DESC;

-- 5. Count objects by path depth (quick health check)
SELECT array_length(storage.foldername(name), 1) AS depth,
       count(*) AS object_count
FROM storage.objects
WHERE bucket_id = 'campaign-assets'
GROUP BY array_length(storage.foldername(name), 1)
ORDER BY depth;

-- 6. Check for any objects outside expected path conventions
-- (e.g., single-segment paths, or paths deeper than 3 segments)
SELECT name,
       array_length(storage.foldername(name), 1) AS depth
FROM storage.objects
WHERE bucket_id = 'campaign-assets'
  AND array_length(storage.foldername(name), 1) NOT IN (2, 3)
ORDER BY depth, name;
