import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

export const isSupabaseConfigured = isValidUrl(url);

const SESSION_KEY = "cliptwo_session_v1";

// Per-tab session storage. Each tab is fully isolated — signing in as a
// different user in another tab does NOT affect this tab. New tabs must
// log in fresh (no automatic session sharing via localStorage).
const hybridCookies = {
  getAll() {
    if (typeof window === "undefined") return [];
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as { name: string; value: string }[];
    } catch {
      return [];
    }
  },
  setAll(cookiesToSet: Array<{ name: string; value: string }>) {
    if (typeof window === "undefined") return;
    const raw = JSON.stringify(cookiesToSet.map((c) => ({ name: c.name, value: c.value })));
    window.sessionStorage.setItem(SESSION_KEY, raw);
  },
};

export const supabase = createBrowserClient(
  isSupabaseConfigured ? (url as string) : "https://placeholder.supabase.co",
  isSupabaseConfigured ? (key as string) : "placeholder-anon-key",
  { cookies: hybridCookies },
);
