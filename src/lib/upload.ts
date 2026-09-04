import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const BUCKET = "campaign-assets";

/**
 * Sanitize a filename for safe storage upload.
 * - Strips path separators (/, \)
 * - Preserves extension
 * - Generates collision-resistant name
 */
function sanitizeFilename(originalName: string): string {
  // Extract extension
  const dot = originalName.lastIndexOf(".");
  const ext = dot >= 0 ? originalName.slice(dot + 1).toLowerCase() : "bin";
  // Strip all path separators and dangerous characters
  const base = originalName
    .slice(0, dot >= 0 ? dot : undefined)
    .replace(/[/\\]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64); // limit length
  // Collision-resistant suffix
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${base || "file"}_${suffix}.${ext}`;
}

/**
 * Upload a file to Supabase Storage under the campaign-assets bucket.
 * Path convention: {user_id}/{campaign_id}/{safe_filename}
 *
 * Returns the public URL on success, or null on failure.
 */
export async function uploadCampaignFile(
  category: string,
  campaignId: string,
  file: File,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  // Get authenticated user — never trust a client-provided user ID
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error("Upload failed: not authenticated");
    return null;
  }

  // Validate campaignId is a non-empty string (UUID format)
  if (!campaignId || typeof campaignId !== "string") {
    console.error("Upload failed: invalid campaignId");
    return null;
  }

  const safeName = sanitizeFilename(file.name);
  // Path must match: {user_id}/{campaign_id}/{filename}
  // The storage policy checks (storage.foldername(name))[1] = auth.uid()::text
  const filePath = `${user.id}/${campaignId}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { upsert: false });

  if (error) {
    console.error(`Upload failed (${category}):`, error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data?.publicUrl ?? null;
}

/**
 * Upload multiple files sequentially and return the list of public URLs.
 * Failed uploads are skipped (no URL returned for them).
 */
export async function uploadCampaignFiles(
  category: string,
  campaignId: string,
  files: File[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const url = await uploadCampaignFile(category, campaignId, file);
    if (url) urls.push(url);
  }
  return urls;
}
