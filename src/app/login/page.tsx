"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Scissors, Film } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [desiredRole, setDesiredRole] = useState<"clipper" | "creator">(
    searchParams.get("role") === "creator" ? "creator" : "clipper",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle(desiredRole);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Google sign-in failed.";
      setError(msg);
      setGoogleLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    if (!emailOk) return setError("Enter a valid email address.");
    if (password.length < 6)
      return setError("Password must be at least 6 characters.");

    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp({
          email,
          password,
          name: name.trim() || email.split("@")[0],
          role: desiredRole,
        });
        router.push(desiredRole === "creator" ? "/creator" : "/clipper");
      } else {
        const u = await signIn({ email, password });
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
      if (
        mode === "signin" &&
        msg === "Invalid email or password." &&
        isSupabaseConfigured
      ) {
        try {
          const { data } = await supabase.rpc("user_exists", {
            target_email: email,
          });
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
    <main className="flex min-h-screen">
      {/* ── Left: Brand area (desktop) ── */}
      <div className="hidden w-1/2 flex-col justify-between bg-foreground p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight cursor-pointer">
          <img src="/cliptwo-logo.png" alt="ClipTwo" className="h-8 w-8 rounded-[8px] object-contain" />
          <span className="text-[17px] text-background">cliptwo</span>
        </Link>

        <div className="max-w-md">
          <h2 className="text-[40px] font-bold leading-[1.1] tracking-tight text-background">
            Turn attention into&nbsp;opportunity.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-background/60">
            ClipTwo connects creators with clippers who turn long-form content
            into short-form clips — paid per verified view, settled straight
            to&nbsp;UPI.
          </p>
        </div>

        <div className="flex items-center gap-6 text-[13px] text-background/40">
          <span className="flex items-center gap-2">
            <Scissors size={14} /> For clippers
          </span>
          <span className="flex items-center gap-2">
            <Film size={14} /> For creators
          </span>
        </div>
      </div>

      {/* ── Right: Auth form ── */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2">
        {/* Mobile logo */}
        <Link
          href="/"
          className="mb-10 flex items-center justify-center gap-2 font-semibold tracking-tight lg:hidden cursor-pointer"
        >
          <img src="/cliptwo-logo.png" alt="ClipTwo" className="h-7 w-7 rounded-md object-contain" />
          <span className="text-[17px]">cliptwo</span>
        </Link>

        <div className="mx-auto w-full max-w-[400px]">
          <h1 className="text-[28px] font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            {mode === "signin"
              ? "Log in to keep clipping and earning."
              : desiredRole === "creator"
                ? "Launch campaigns and grow your brand."
                : "Join cliptwo as a clipper and start earning."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            {mode === "signup" && (
              <>
                {/* Name */}
                <div>
                  <label htmlFor="auth-name" className="mb-1.5 block text-[13px] font-medium text-foreground">
                    Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="h-12 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[15px] outline-none transition-colors focus:border-foreground/30"
                  />
                </div>

                {/* Role selector */}
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-foreground">
                    I want to join as
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDesiredRole("clipper")}
                      className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border text-[15px] font-medium transition-all duration-150 ${
                        desiredRole === "clipper"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
                      }`}
                    >
                      <Scissors size={16} />
                      Clipper
                    </button>
                    <button
                      type="button"
                      onClick={() => setDesiredRole("creator")}
                      className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border text-[15px] font-medium transition-all duration-150 ${
                        desiredRole === "creator"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
                      }`}
                    >
                      <Film size={16} />
                      Creator
                    </button>
                  </div>
                </div>

                {/* Google sign-up */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-[10px] border border-border/60 bg-card text-[15px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {googleLoading ? "Connecting…" : "Continue with Google"}
                </button>

                {/* Divider */}
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-border/40" />
                  <span className="mx-3 text-[13px] text-muted">or</span>
                  <div className="flex-grow border-t border-border/40" />
                </div>
              </>
            )}

            {mode === "signin" && (
              <>
                {/* Google sign-in */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-[10px] border border-border/60 bg-card text-[15px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  {googleLoading ? "Connecting…" : "Continue with Google"}
                </button>

                {/* Divider */}
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-border/40" />
                  <span className="mx-3 text-[13px] text-muted">or</span>
                  <div className="flex-grow border-t border-border/40" />
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-[13px] font-medium text-foreground">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[15px] outline-none transition-colors focus:border-foreground/30"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-[13px] font-medium text-foreground">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[15px] outline-none transition-colors focus:border-foreground/30"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-[10px] border border-red/20 bg-red/5 px-4 py-3 text-[14px] text-red">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Log in"
                  : "Create account"}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          {/* Mode switch */}
          <p className="mt-6 text-center text-[14px] text-muted">
            {mode === "signin" ? "New to ClipTwo? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError("");
              }}
              className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
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
