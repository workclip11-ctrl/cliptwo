/**
 * Private asset URL resolution.
 *
 * Storage paths for private files (source footage, brand assets) are stored
 * in the database instead of fake "public" URLs. This module resolves those
 * paths to short-lived signed URLs for authenticated display/download.
 *
 * Path convention:
 *   Public:  {user_id}/{campaign_id}/{filename}
 *   Private: {user_id}/{campaign_id}/private/{filename}
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const BUCKET = "campaign-assets";

/**
 * Returns true if the value looks like a Supabase storage path (not a URL).
 * Storage paths look like: uuid/uuid/filename.ext or uuid/uuid/private/filename.ext
 */
export function isStoragePath(url: string): boolean {
  return !url.startsWith("http://") && !url.startsWith("https://");
}

/**
 * Resolve a storage path to a short-lived signed URL (60 minutes).
 * Returns null on failure or if the input is already a full URL.
 */
export async function resolveAssetUrl(
  urlOrPath: string,
): Promise<string | null> {
  if (!isStoragePath(urlOrPath)) return urlOrPath;
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(urlOrPath, 60 * 60);

  if (error || !data?.signedUrl) {
    console.error("Failed to create signed URL:", error?.message);
    return null;
  }

  return data.signedUrl;
}

/**
 * Resolve an array of CampaignSourceAsset objects, converting any storage
 * paths in the `url` field to signed URLs. Returns a new array (immutable).
 */
export async function resolveAssetUrls<T extends { url: string }>(
  assets: T[],
): Promise<T[]> {
  const resolved = await Promise.all(
    assets.map(async (a) => {
      if (!isStoragePath(a.url)) return a;
      const signed = await resolveAssetUrl(a.url);
      return signed ? { ...a, url: signed } : a;
    }),
  );
  return resolved;
}

/**
 * Resolve an array of thumbnail URLs (plain strings).
 * Returns a new array with storage paths converted to signed URLs.
 */
export async function resolveThumbnailUrls(
  urls: string[],
): Promise<string[]> {
  return Promise.all(
    urls.map(async (u) => {
      if (!isStoragePath(u)) return u;
      const signed = await resolveAssetUrl(u);
      return signed ?? u;
    }),
  );
}
