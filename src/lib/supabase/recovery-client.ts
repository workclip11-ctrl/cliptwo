import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Password-recovery-only Supabase client.
 *
 * Uses @supabase/ssr's createBrowserClient which stores the PKCE
 * code_verifier in HTTP cookies. Cookies are shared across all tabs
 * on the same domain, so the recovery link can open in a new tab
 * and still find the verifier.
 *
 * This client is intentionally SEPARATE from the per-tab browser
 * client (src/lib/supabase/client.ts) which uses sessionStorage for
 * session isolation. Normal auth (Google Sign-In, email/password
 * login, etc.) continues to use the per-tab client.
 *
 * This client is used ONLY for:
 *   - resetPasswordForEmail() in /forgot-password
 *   - exchangeCodeForSession() in /reset-password
 *   - updateUser() in /reset-password (after exchange)
 */
export const recoveryClient = createBrowserClient(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder-anon-key",
  {
    cookieOptions: {
      name: "sb_cliptwo_recovery",
    },
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);
