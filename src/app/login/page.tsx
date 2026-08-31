"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Scissors, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({ id: "", name: name.trim() || "Clipper", email, role: "clipper", password });
        router.push("/clipper");
      } else {
        const u = await signIn("clipper", { email, password, name });
        router.push(
          u?.role === "admin"
            ? "/admin"
            : u?.role === "creator"
              ? "/creator"
              : "/clipper",
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      if (mode === "signin" && msg === "Invalid email or password." && isSupabaseConfigured) {
        try {
          const { data } = await supabase.rpc("user_exists", { target_email: email });
          if (data === false) {
            setMode("signup");
            setError("You're new here — create your account below.");
            return;
          }
        } catch {
          /* fall through to generic message */
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
            <Scissors size={15} />
          </span>
          cliptwo
        </Link>

        <div className="rounded-3xl border bg-card p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "signin"
                ? "Sign in to keep clipping and earning."
                : "Join India's clipping marketplace in seconds."}
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
                />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "signin" ? "Log in" : "Create account"}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? "New to cliptwo? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
