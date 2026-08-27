import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

export const isSupabaseConfigured = isValidUrl(url);

export const supabase = createBrowserClient(
  isSupabaseConfigured ? (url as string) : "https://placeholder.supabase.co",
  isSupabaseConfigured ? (key as string) : "placeholder-anon-key",
);
