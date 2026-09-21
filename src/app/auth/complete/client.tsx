"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Scissors, Film } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Phase = "loading" | "role_select" | "creating" | "error";

export default function AuthCompleteClient() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);
  const routedRef = useRef(false);
  const handlingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");

  const routeByRole = useCallback(
    (role: string) => {
      if (routedRef.current) return;
      routedRef.current = true;
      window.history.replaceState({}, "", "/auth/complete");
      router.replace(
        role === "admin"
          ? "/admin"
          : role === "creator"
            ? "/creator"
            : "/clipper",
      );
    },
    [router],
  );

  const finalizeAndRoute = useCallback(
    async (selectedRole: "clipper" | "creator") => {
      setPhase("creating");
      try {
        const { data, error: rpcError } = await supabase.rpc("finalize_profile", {
          p_role: selectedRole,
        });
        if (rpcError) throw rpcError;
        const role = (data as { role?: string })?.role ?? selectedRole;
        routeByRole(role);
      } catch {
        setPhase("error");
        setError("Failed to create your account. Please try again.");
      }
    },
    [routeByRole],
  );

  useEffect(() => {
    let active = true;

    const handleSession = async (uid: string) => {
      if (!active) return;

      let profileRole: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        if (profile?.role) profileRole = profile.role;
      } catch {
        /* non-fatal */
      }

      if (!active) return;

      if (profileRole) {
        routeByRole(profileRole);
        return;
      }

      try {
        const { data: userData } = await supabase.auth.getUser();
        const metaRole = userData?.user?.user_metadata?.role;
        if (metaRole === "clipper" || metaRole === "creator") {
          await finalizeAndRoute(metaRole);
          return;
        }
      } catch {
        /* fall through to role selection */
      }

      if (!active) return;

      setPhase("role_select");
    };

    const cleanup = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (subRef.current) {
        subRef.current.unsubscribe();
        subRef.current = null;
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!active || routedRef.current || handlingRef.current) return;
      if (event === "SIGNED_IN" && newSession) {
        try {
          handlingRef.current = true;
          cleanup();
          await handleSession(newSession.user.id);
        } catch {
          if (active && !routedRef.current) {
            router.replace("/login?error=oauth_failed");
          }
        } finally {
          handlingRef.current = false;
        }
      }
    });
    subRef.current = subscription;

    timerRef.current = setTimeout(() => {
      if (active && !routedRef.current) {
        cleanup();
        router.replace("/login?error=oauth_failed");
      }
    }, 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && active && !routedRef.current && !handlingRef.current) {
        (async () => {
          try {
            handlingRef.current = true;
            cleanup();
            await handleSession(session.user.id);
          } catch {
            if (active && !routedRef.current) {
              router.replace("/login?error=oauth_failed");
            }
          } finally {
            handlingRef.current = false;
          }
        })();
      }
    });

    return () => {
      active = false;
      cleanup();
    };
  }, [router, routeByRole, finalizeAndRoute]);

  // ── Role selection UI ──────────────────────────────────────────
  if (phase === "role_select") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">
              Welcome to ClipTwo
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              Choose how you&apos;d like to use ClipTwo.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => finalizeAndRoute("clipper")}
              className="flex h-[72px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-border/60 bg-card text-[14px] font-medium transition-all duration-150 hover:border-foreground/20 hover:bg-accent-soft"
            >
              <Scissors size={16} />
              Continue as Clipper
              <span className="text-[11px] font-normal text-muted/70">
                Create clips, earn from views
              </span>
            </button>

            <button
              type="button"
              onClick={() => finalizeAndRoute("creator")}
              className="flex h-[72px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-border/60 bg-card text-[14px] font-medium transition-all duration-150 hover:border-foreground/20 hover:bg-accent-soft"
            >
              <Film size={16} />
              Continue as Creator
              <span className="text-[11px] font-normal text-muted/70">
                Launch campaigns, grow reach
              </span>
            </button>
          </div>

          {error && (
            <div className="rounded-[10px] border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-red">
              {error}
            </div>
          )}

          <p className="text-[12px] text-muted">
            Your role cannot be changed after selection.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "creating") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[15px] text-muted">Creating your account…</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-[15px] text-red">{error}</p>
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-[15px] text-muted">Completing sign-in…</p>
    </div>
  );
}
