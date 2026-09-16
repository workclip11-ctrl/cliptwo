import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isValidUrl(u?: string) {
  return !!u && (u.startsWith("http://") || u.startsWith("https://"));
}

// Dedicated browser-only recovery client using implicit flow.
// This client is completely separate from the normal auth client in client.ts.
// - flowType: "implicit" → token arrives in URL hash, no PKCE cookies needed
// - storageKey: "cliptwo_recovery" → isolated from normal auth session
// - No per-tab isolation needed — recovery is always a one-shot flow
export const recoveryClient = createClient(
  isValidUrl(url) ? (url as string) : "https://placeholder.supabase.co",
  isValidUrl(key) ? (key as string) : "placeholder-anon-key",
  {
    auth: {
      flowType: "implicit",
      storageKey: "cliptwo_recovery",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
