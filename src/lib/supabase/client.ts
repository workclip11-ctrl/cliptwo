import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

export const isSupabaseConfigured = isValidUrl(url);

// ---------------------------------------------------------------------------
// Per-tab authentication isolation
//
// Problem: @supabase/ssr's createBrowserClient uses a shared BroadcastChannel
// (named after storageKey, default sb-<project>-auth-token) to synchronize
// auth events between ALL tabs on the same origin. When Tab B signs in, it
// broadcasts SIGNED_IN to Tab A via BroadcastChannel, causing Tab A's
// onAuthStateChange to fire with Tab B's session.
//
// Solution: Use @supabase/supabase-js directly with:
//   1. A per-tab storageKey → isolates BroadcastChannel per tab
//   2. A sessionStorage storage adapter → tab-scoped session persistence
//   3. persistSession: true → session survives page reload within the tab
//
// Server-side auth (middleware, API routes, Server Components) continues to
// use @supabase/ssr with HTTP cookies — completely independent of the
// browser client's sessionStorage.
// ---------------------------------------------------------------------------

const TAB_ID_KEY = "cliptwo_tab_id";

function getTabId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.sessionStorage.getItem(TAB_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(TAB_ID_KEY, id);
  }
  return id;
}

// Stable per-tab reference — computed once when the module loads in this tab.
const tabId = getTabId();

// Unique storageKey per tab → unique BroadcastChannel name → no cross-tab events.
const storageKey = `cliptwo_auth_${tabId}`;

// sessionStorage adapter — proper key-value interface for GoTrueClient.
// Each key is stored as a separate sessionStorage entry namespaced by tabId.
const sessionStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    return window.sessionStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    window.sessionStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(
  isSupabaseConfigured ? (url as string) : "https://placeholder.supabase.co",
  isSupabaseConfigured ? (key as string) : "placeholder-anon-key",
  {
    auth: {
      storageKey,
      storage: sessionStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);
