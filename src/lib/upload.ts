import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const BUCKET = "campaign-assets";

function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "bin";
}

function pathName(category: string, fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${category}/${timestamp}-${random}.${ext(fileName)}`;
}

/**
 * Upload a file to Supabase Storage under the campaign-assets bucket.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadCampaignFile(
  category: string,
  file: File,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;

  const filePath = pathName(category, file.name);
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
  files: File[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const url = await uploadCampaignFile(category, file);
    if (url) urls.push(url);
  }
  return urls;
}
