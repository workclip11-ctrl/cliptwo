"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors, Film } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  isOAuthIntentRole,
  readOAuthIntent,
  clearOAuthIntent,
} from "@/lib/oauth-intent";

type Phase = "loading" | "role_select" | "creating" | "error";

export default function AuthCompleteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
        // Existing profile is authoritative — ignore any OAuth intent and
        // discard this tab's stored intent so it cannot leak into a later
        // attempt (stale-role protection).
        clearOAuthIntent();
        routeByRole(profileRole);
        return;
      }

      // New user (no profile): recover the intended onboarding role for THIS
      // OAuth transaction. Precedence:
      //   1. Valid stored per-tab intent: the URL intent is accepted ONLY when
      //      its nonce exactly matches the stored nonce (same transaction).
      //      Missing or mismatched URL nonce → stored intent wins (stale
      //      protection: a nonceless/stale callback can never override the
      //      latest per-tab intent).
      //   2. No stored intent → a strictly allowlisted URL intent may be used.
      //   3. Legacy user_metadata.role (last-resort fallback; Google OAuth
      //      queryParams never populate it, but email-style metadata might)
      //
      // Strict allowlist — anything else falls through to role selection.
      let intentRole: "clipper" | "creator" | null = null;
      const urlIntent = searchParams.get("intent");
      const urlNonce = searchParams.get("nonce");
      const stored = readOAuthIntent();
      if (stored) {
        // Stored per-tab intent is authoritative unless the callback proves it
        // belongs to the same transaction via an exact nonce match AND agrees
        // with that transaction's role (a nonce-matching but role-differing
        // callback is treated as tampered — stored wins).
        if (
          isOAuthIntentRole(urlIntent) &&
          urlNonce &&
          urlNonce === stored.nonce &&
          urlIntent === stored.role
        ) {
          intentRole = urlIntent;
        } else {
          intentRole = stored.role;
        }
      } else if (isOAuthIntentRole(urlIntent)) {
        intentRole = urlIntent;
      }
      if (!intentRole) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const metaRole = userData?.user?.user_metadata?.role;
          if (isOAuthIntentRole(metaRole)) intentRole = metaRole;
        } catch {
          /* fall through to role selection */
        }
      }

      if (intentRole) {
        // Consume the one-time intent before finalizing.
        clearOAuthIntent();
        await finalizeAndRoute(intentRole);
        return;
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
  }, [router, searchParams, routeByRole, finalizeAndRoute]);

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
              onClick={() => {
                clearOAuthIntent();
                finalizeAndRoute("clipper");
              }}
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
              onClick={() => {
                clearOAuthIntent();
                finalizeAndRoute("creator");
              }}
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
