-- =============================================================
-- Supabase Storage setup for campaign assets
--
-- Run this ONCE in the Supabase SQL Editor to create the
-- storage bucket and access policies.
-- =============================================================

-- 1. Create the bucket (public read access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-assets', 'campaign-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload to their own folder only
-- Path convention: {user_id}/{campaign_id}/{filename}
-- Requires BOTH: user owns the first folder AND the campaign belongs to them.
DROP POLICY IF EXISTS "campaign_assets_insert" ON storage.objects;
CREATE POLICY "campaign_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = (storage.foldername(name))[2]::uuid
        AND created_by = auth.uid()
    )
  );

-- 3. Allow public read access (bucket is public)
DROP POLICY IF EXISTS "campaign_assets_select" ON storage.objects;
CREATE POLICY "campaign_assets_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'campaign-assets');

-- 4. Allow owners to delete their own uploads only
-- Requires BOTH: user owns the first folder AND the campaign belongs to them.
DROP POLICY IF EXISTS "campaign_assets_delete" ON storage.objects;
CREATE POLICY "campaign_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'campaign-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE id = (storage.foldername(name))[2]::uuid
        AND created_by = auth.uid()
    )
  );
