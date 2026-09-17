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
//   2. A hybrid storage adapter → session in sessionStorage (per-tab),
//      PKCE code_verifier in localStorage (cross-tab, for recovery)
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

// Hybrid storage adapter — proper key-value interface for GoTrueClient.
//
// Session data (tokens, user) → sessionStorage (per-tab isolation).
// PKCE code_verifier → localStorage with a FIXED key (cross-tab).
//
// Why a fixed key: Supabase's PKCE recovery flow stores the code_verifier
// when resetPasswordForEmail() is called, but the recovery email link opens
// in a new tab with a different per-tab storageKey. The GoTrue client in
// the new tab constructs the PKCE lookup key from its OWN storageKey
// (e.g., "cliptwo_auth_<newTabId>-code-verifier"), which differs from the
// originating tab's key. By mapping ALL PKCE keys to a single, fixed
// localStorage key, any tab can find the verifier regardless of which tab
// initiated the flow.
// ---------------------------------------------------------------------------
const FIXED_PKCE_KEY = "cliptwo_pkce_code_verifier";
const PKCE_VERIFIER_SUFFIX = "-code-verifier";
const FLOW_INDEX_SUFFIX = "-flows-code-verifier";

function isPkceVerifierKey(k: string) {
  return k.endsWith(PKCE_VERIFIER_SUFFIX) && !k.endsWith(FLOW_INDEX_SUFFIX);
}

const hybridStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    if (isPkceVerifierKey(key)) return window.localStorage.getItem(FIXED_PKCE_KEY);
    return window.sessionStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    if (isPkceVerifierKey(key)) {
      window.localStorage.setItem(FIXED_PKCE_KEY, value);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    if (isPkceVerifierKey(key)) {
      window.localStorage.removeItem(FIXED_PKCE_KEY);
    } else {
      window.sessionStorage.removeItem(key);
    }
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(url as string, key as string, {
      auth: {
        storageKey,
        storage: hybridStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  // When Supabase is not configured, create a client with invalid credentials.
  // All operations are gated by isSupabaseConfigured checks.
  : createClient("https://invalid.supabase.co", "invalid-key", {
      auth: {
        storageKey,
        storage: hybridStorageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
