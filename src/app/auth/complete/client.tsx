"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function AuthCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cleanupRef = useRef<(() => void) | null>(null);
  const routedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        // Register the auth-state listener FIRST, before checking
        // getSession(). This prevents the race condition where
        // detectSessionInUrl emits SIGNED_IN between getSession()
        // and onAuthStateChange registration, causing a missed event.
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!active || routedRef.current) return;
          if (event === "SIGNED_IN" && newSession) {
            routedRef.current = true;
            cleanupRef.current?.();
            await routeUser(newSession.user.id);
          }
        });

        // Safety timeout — if no session arrives within 8s, bail out.
        const timer = setTimeout(() => {
          if (active && !routedRef.current) {
            router.replace("/login?error=oauth_failed");
          }
        }, 8000);

        cleanupRef.current = () => {
          active = false;
          clearTimeout(timer);
          subscription.unsubscribe();
        };

        // NOW check if the session is already available.
        // If detectSessionInUrl already completed the exchange,
        // getSession() returns the session immediately.
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session && active && !routedRef.current) {
          routedRef.current = true;
          cleanupRef.current?.();
          await routeUser(session.user.id);
        }
      } catch {
        if (active && !routedRef.current) {
          router.replace("/login?error=oauth_failed");
        }
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

      // Remove the OAuth code/state from the URL
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
