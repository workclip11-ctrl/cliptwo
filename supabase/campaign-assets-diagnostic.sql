-- Check what policies actually exist on storage.objects
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- Check if bucket is actually private
SELECT id, name, public FROM storage.buckets WHERE id = 'campaign-assets';

-- Check if data exists (bypasses RLS as superuser)
SELECT count(*) AS total FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%/test-%';

-- Check a specific path
SELECT name, foldername(name) AS parts FROM storage.objects WHERE bucket_id = 'campaign-assets' AND name LIKE '%test-a.mp4';
