"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scissors, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";
type Role = "clipper" | "creator" | "admin";

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<Role>("clipper");
  const [adminMode, setAdminMode] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("admin");
      if (p === "1") setAdminMode(true);
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({ id: "", name: name.trim() || "Admin", email, role, password });
        router.push(
          role === "admin" ? "/admin" : role === "clipper" ? "/clipper" : "/creator",
        );
      } else {
        const u = await signIn(role, { email, password, name });
        router.push(
          u?.role === "admin"
            ? "/admin"
            : u?.role === "creator"
              ? "/creator"
              : "/clipper",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
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

          {/* role switch — only when creating an account */}
          {mode === "signup" && (
            <div
              className={`mt-6 grid gap-2 rounded-xl border bg-background p-1 ${
                adminMode ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              {(["clipper", "creator", "admin"] as Role[])
                .filter((r) => r !== "admin" || adminMode)
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
                      role === r ? "bg-accent text-white" : "text-muted"
                    }`}
                  >
                    {r === "clipper" ? "I'm a clipper" : r === "creator" ? "I'm a creator" : "I'm an admin"}
                  </button>
                ))}
            </div>
          )}

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
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
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
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Prototype build — accounts are stored in your browser session via Supabase.
        </p>
      </div>
    </main>
  );
}
