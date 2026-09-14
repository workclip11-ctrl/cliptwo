"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

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

        // Use the SAME singleton supabase client that started the OAuth
        // flow in supabase/client.ts. The PKCE code_verifier is stored
        // in this tab's sessionStorage under that client's storageKey.
        // A second client — even with the same storageKey — cannot
        // reliably find the flow state.
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[auth/complete] exchangeCodeForSession failed:", {
            name: error.name,
            message: error.message,
            status: error.status,
          });
          router.replace("/login?error=oauth_failed");
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        // profiles.role is the SOLE source of truth for authorization.
        let userRole = "clipper";
        try {
          const { data: profile } = await supabase
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
