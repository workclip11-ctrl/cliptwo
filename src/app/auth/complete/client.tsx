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
        // Tokens are passed as URL query parameters by the server callback.
        const accessToken = searchParams.get("access_token");
        const refreshToken = searchParams.get("refresh_token");
        const roleParam = searchParams.get("role");

        if (!accessToken || !refreshToken) {
          router.replace("/login?error=oauth_failed");
          return;
        }

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

        const { error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
        const metaRole: string | undefined =
          meta.role === "clipper" || meta.role === "creator" || meta.role === "admin"
            ? (meta.role as string)
            : undefined;

        const storedRole = window.sessionStorage.getItem("cliptwo_oauth_role");
        window.sessionStorage.removeItem("cliptwo_oauth_role");

        // Priority: DB role (from callback) > metadata > stored role > default
        const userRole = roleParam ?? metaRole ?? storedRole ?? "clipper";

        // Clean URL — remove tokens and role from query params
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
