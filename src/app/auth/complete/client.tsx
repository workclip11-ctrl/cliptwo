"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        // Supabase's detectSessionInUrl: true (in supabase/client.ts)
        // automatically processes the ?code= param and exchanges it for
        // a session. We do NOT call exchangeCodeForSession manually —
        // that would attempt a double-exchange and fail.
        //
        // Check if the session is already available (auto-exchange done).
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          if (active) await routeUser(session.user.id);
          return;
        }

        // No session yet — the auto-exchange may still be in progress.
        // Subscribe to auth state changes and wait for SIGNED_IN.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!active) return;
          if (event === "SIGNED_IN" && newSession) {
            cleanupRef.current?.();
            await routeUser(newSession.user.id);
          }
        });

        // Safety timeout — if no session arrives within 5s, bail out.
        const timer = setTimeout(() => {
          if (active) router.replace("/login?error=oauth_failed");
        }, 5000);

        cleanupRef.current = () => {
          active = false;
          clearTimeout(timer);
          subscription.unsubscribe();
        };
      } catch {
        if (active) router.replace("/login?error=oauth_failed");
      }
    };

    const routeUser = async (userId: string) => {
      // profiles.role is the SOLE source of truth for authorization.
      let userRole = "clipper";
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
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
    };

    run();

    return () => {
      active = false;
      cleanupRef.current?.();
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-[15px] text-muted">Completing sign-in…</p>
    </div>
  );
}
