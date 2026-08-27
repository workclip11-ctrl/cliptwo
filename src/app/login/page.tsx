"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scissors, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";
type Role = "clipper" | "creator";

export default function AuthPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [role, setRole] = useState<Role>("clipper");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    signIn(role);
    router.push(role === "clipper" ? "/clipper" : "/creator");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold tracking-tight">
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

          {/* role switch */}
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border bg-background p-1">
            {(["clipper", "creator"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg py-2 text-sm font-medium capitalize transition-colors ${role === r ? "bg-accent text-white" : "text-muted"}`}
              >
                {r === "clipper" ? "I'm a clipper" : "I'm a creator"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Name</label>
                <input
                  required
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

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight size={15} />
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? "New to cliptwo? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Prototype build — no real authentication. Choosing a role drops you into that dashboard.
        </p>
      </div>
    </main>
  );
}
