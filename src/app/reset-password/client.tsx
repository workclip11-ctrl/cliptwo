"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { recoveryClient } from "@/lib/supabase/recovery-client";

type Status = "loading" | "ready" | "success" | "error";

export default function ResetPasswordClient() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    // Handle password recovery via implicit flow.
    // The Supabase client auto-detects the token in the URL hash and fires
    // PASSWORD_RECOVERY when the user arrives from the reset email link.
    const {
      data: { subscription },
    } = recoveryClient.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
        return;
      }

      // If the client already has a session from automatic URL processing
      // (e.g. INITIAL_SESSION fires with the recovery session), treat it
      // as a valid recovery session if no other status has been set.
      if (event === "INITIAL_SESSION" && session && status === "loading") {
        setStatus("ready");
        return;
      }
    });

    // Also check if the client already has a session (e.g. token was
    // processed before the listener was registered).
    recoveryClient.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session && status === "loading") {
        setStatus("ready");
      } else if (!session && status === "loading") {
        // No session and no recovery event — link is invalid or expired.
        setStatus("error");
        setError("Invalid or expired reset link. Please request a new one.");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [status]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      return setError("Password must be at least 6 characters.");
    }
    if (newPassword !== confirmPassword) {
      return setError("Passwords do not match.");
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await recoveryClient.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(
          updateError.message.includes("same")
            ? "New password must be different from your current password."
            : "Failed to update password. Please try again.",
        );
        return;
      }
      // Sign out the recovery client so the recovery session is not left active.
      await recoveryClient.auth.signOut();
      setStatus("success");
    } catch {
      setError("Failed to update password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] text-center">
          <img
            src="/cliptwo-logo.png"
            alt="ClipTwo"
            className="mx-auto mb-6 h-7 w-7 rounded-md object-contain"
          />
          <p className="text-[15px] text-muted">Verifying reset link…</p>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] text-center">
          <img
            src="/cliptwo-logo.png"
            alt="ClipTwo"
            className="mx-auto mb-6 h-7 w-7 rounded-md object-contain"
          />
          <div className="rounded-[10px] border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-red">
            {error}
          </div>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground px-6 text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Request a new link
          </Link>
        </div>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px] text-center">
          <img
            src="/cliptwo-logo.png"
            alt="ClipTwo"
            className="mx-auto mb-6 h-7 w-7 rounded-md object-contain"
          />
          <h1 className="text-[28px] font-bold tracking-tight">
            Password updated
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Your password has been reset successfully.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground px-6 text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Log in
            <ArrowRight size={15} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <Link
          href="/"
          className="mb-10 flex items-center justify-center gap-2 font-semibold tracking-tight cursor-pointer"
        >
          <img
            src="/cliptwo-logo.png"
            alt="ClipTwo"
            className="h-7 w-7 rounded-md object-contain"
          />
          <span className="text-[16px]">cliptwo</span>
        </Link>

        <h1 className="text-[28px] font-bold tracking-tight">
          Set new password
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Choose a strong password for your account.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="reset-password"
              className="mb-1.5 block text-[13px] font-medium text-foreground"
            >
              New password
            </label>
            <input
              id="reset-password"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
            />
          </div>

          <div>
            <label
              htmlFor="reset-confirm"
              className="mb-1.5 block text-[13px] font-medium text-foreground"
            >
              Confirm password
            </label>
            <input
              id="reset-confirm"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
            />
          </div>

          {error && (
            <div className="rounded-[10px] border border-red/20 bg-red/5 px-4 py-3 text-[13px] text-red">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Updating…" : "Update password"}
            {!submitting && <ArrowRight size={15} />}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-muted">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
