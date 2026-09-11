-- ============================================================================
-- Campaign Assets Storage Security (Phase 4 Security Fix)
-- ============================================================================
-- Problem: The campaign-assets bucket is fully public. Source footage (videos,
-- source assets) is publicly readable by anyone with the URL.
--
-- Solution: Set bucket to private, then path-based access control via policies.
--
-- Path convention:
--   Public:  {user_id}/{campaign_id}/{filename}        (thumbnails, logos)
--   Private: {user_id}/{campaign_id}/private/{filename} (source footage, brand assets)
--
-- Access rules:
--   Public files (3-part path): anyone can read
--   Private files (4-part path with 'private' prefix):
--     - Creator: can read own files
--     - Admin: can read all
--     - Clipper: can read files for open+verified campaigns (role='clipper' required)
--     - Others: DENIED
--
-- This migration is idempotent — safe to run multiple times.
-- ============================================================================

-- 0. Make bucket private (removes implicit public read access)
UPDATE storage.buckets SET public = false WHERE id = 'campaign-assets';

-- 1. Drop ALL existing policies on storage.objects to start clean
DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON storage.objects';
  END LOOP;
END $$;

-- 2. Public can read non-private files (3-part path: user/campaign/file)
--    NOTE: storage.foldername() excludes the filename, so a 3-segment path
--    produces an array of length 2, not 3.
CREATE POLICY "campaign_assets_select_public" ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'campaign-assets'
    AND array_length(storage.foldername(name), 1) = 2
  );

-- 3. Authenticated users can read private files (4-part path with 'private' prefix)
--    Creator: own files only
--    Admin: all files
--    Clipper: open+verified campaign files ONLY when profile role = 'clipper'
--    NOTE: storage.foldername() excludes the filename, so a 4-segment path
--    (user/campaign/private/file) produces an array of length 3.
CREATE POLICY "campaign_assets_select_private" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-assets'
    AND array_length(storage.foldername(name), 1) = 3
    AND (storage.foldername(name))[3] = 'private'
    AND (
      -- Creator: own files
      (storage.foldername(name))[1] = auth.uid()::text
      -- Admin: all files
      OR public.is_admin()
      -- Clipper: open+verified campaign files, only if profile role = 'clipper'
      OR (
        (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid()
            AND role = 'clipper'
        )
        AND EXISTS (
          SELECT 1 FROM public.campaigns
          WHERE id = (storage.foldername(name))[2]::uuid
            AND status = 'open'
            AND launch_payment_status = 'verified'
        )
      )
    )
  );

-- 4. Update INSERT policy to support both public and private paths
--    NOTE: storage.foldername() excludes the filename.
--    Public path: {user_id}/{campaign_id}/{filename} → foldername length 2
--    Private path: {user_id}/{campaign_id}/private/{filename} → foldername length 3
CREATE POLICY "campaign_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      -- Public path: {user_id}/{campaign_id}/{filename}
      (
        array_length(storage.foldername(name), 1) = 2
        AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM public.campaigns
          WHERE id = (storage.foldername(name))[2]::uuid
            AND created_by = auth.uid()
        )
      )
      OR
      -- Private path: {user_id}/{campaign_id}/private/{filename}
      (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[3] = 'private'
        AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM public.campaigns
          WHERE id = (storage.foldername(name))[2]::uuid
            AND created_by = auth.uid()
        )
      )
    )
  );

-- 5. Update DELETE policy to support both public and private paths
--    NOTE: storage.foldername() excludes the filename.
CREATE POLICY "campaign_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
      -- Public path
      (
        array_length(storage.foldername(name), 1) = 2
        AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM public.campaigns
          WHERE id = (storage.foldername(name))[2]::uuid
            AND created_by = auth.uid()
        )
      )
      OR
      -- Private path
      (
        array_length(storage.foldername(name), 1) = 3
        AND (storage.foldername(name))[3] = 'private'
        AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM public.campaigns
          WHERE id = (storage.foldername(name))[2]::uuid
            AND created_by = auth.uid()
        )
      )
    )
  );
