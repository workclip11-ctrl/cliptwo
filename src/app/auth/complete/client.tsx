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
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

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
        const role: string | undefined =
          meta.role === "clipper" || meta.role === "creator" || meta.role === "admin"
            ? (meta.role as string)
            : undefined;

        const desiredRole = searchParams.get("role");
        const storedRole = window.sessionStorage.getItem("cliptwo_oauth_role");
        window.sessionStorage.removeItem("cliptwo_oauth_role");

        const userRole = role ?? desiredRole ?? storedRole ?? "clipper";

        window.history.replaceState({}, "", window.location.pathname);

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
