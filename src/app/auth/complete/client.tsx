"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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

const storageKey = `cliptwo_auth_${getTabId()}`;

const sessionStorageAdapter = {
  getItem: async (k: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(k);
  },
  setItem: async (k: string, v: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(k, v);
  },
  removeItem: async (k: string): Promise<void> => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(k);
  },
};

export default function AuthCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const code = searchParams.get("code");
        if (!code) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        // Create a per-tab Supabase client with the SAME storageKey and
        // sessionStorageAdapter as the global client in supabase/client.ts.
        // The PKCE code_verifier is stored in this tab's sessionStorage
        // under the per-tab storageKey — it must be found here for the
        // exchange to succeed.
        const client = createClient(url, key, {
          auth: {
            storageKey,
            storage: sessionStorageAdapter,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            flowType: "pkce",
          },
        });

        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        // profiles.role is the SOLE source of truth for authorization.
        let userRole = "clipper";
        try {
          const { data: profile } = await client
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.role) userRole = profile.role;
        } catch {
          /* non-fatal — defaults to "clipper" */
        }

        // Remove the OAuth code from the URL
        window.history.replaceState({}, "", "/auth/complete");

        router.replace(
          userRole === "admin"
            ? "/admin"
            : userRole === "creator"
              ? "/creator"
              : "/clipper",
        );
      } catch {
        router.replace("/login?error=oauth_failed");
      }
    };

    handleAuth();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-[15px] text-muted">Completing sign-in…</p>
    </div>
  );
}
