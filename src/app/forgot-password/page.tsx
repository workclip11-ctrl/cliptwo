"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return setError("Enter a valid email address.");

    if (!isSupabaseConfigured) {
      return setError("Authentication is not configured.");
    }

    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/reset-password` },
      );
      if (resetError) {
        setError("Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
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
          Reset your password
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {sent ? (
          <div className="mt-8 space-y-6">
            <div className="rounded-[10px] border border-green/20 bg-green/5 px-4 py-3 text-[13px] text-green">
              If an account exists for this email, we&apos;ve sent a password
              reset link.
            </div>
            <Link
              href="/login"
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="forgot-email"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
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
              disabled={loading}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground text-[14px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        )}

        {!sent && (
          <p className="mt-6 text-center text-[13px] text-muted">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
