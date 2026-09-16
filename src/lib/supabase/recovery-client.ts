import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

// Dedicated browser-only recovery client using implicit flow.
// This client is completely separate from the normal auth client in client.ts.
// - flowType: "implicit" → token arrives in URL hash, no PKCE cookies needed
// - storageKey: "cliptwo_recovery" → isolated from normal auth session
// - No per-tab isolation needed — recovery is always a one-shot flow
export const recoveryClient = createClient(url, key, {
  auth: {
    flowType: "implicit",
    storageKey: "cliptwo_recovery",
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
