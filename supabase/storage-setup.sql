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

-- 2. Allow authenticated users to upload
DROP POLICY IF EXISTS "campaign_assets_insert" ON storage.objects;
CREATE POLICY "campaign_assets_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-assets');

-- 3. Allow public read access (bucket is public)
DROP POLICY IF EXISTS "campaign_assets_select" ON storage.objects;
CREATE POLICY "campaign_assets_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'campaign-assets');

-- 4. Allow owners to delete their own uploads
DROP POLICY IF EXISTS "campaign_assets_delete" ON storage.objects;
CREATE POLICY "campaign_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
