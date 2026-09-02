"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export type Role = "clipper" | "creator" | "admin";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions?: string[];
}

interface AuthValue {
  isSignedIn: boolean;
  role: Role | null;
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (
    creds: { email: string; password: string },
  ) => Promise<UserProfile | null>;
  signUp: (data: {
    email: string;
    password: string;
    name: string;
    role: Role;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function mapError(err: { message: string }): string {
  const m = err.message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Invalid email or password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email before signing in.";
  if (m.includes("user already registered"))
    return "An account with this email already exists.";
  if (m.includes("password")) return "Password must be at least 6 characters.";
  return err.message;
}

function profileFromUser(user: {
  id?: string | null;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null): UserProfile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role: Role =
    meta.role === "clipper" || meta.role === "creator" || meta.role === "admin"
      ? (meta.role as Role)
      : "clipper";
  const name =
    typeof meta.name === "string" && meta.name
      ? meta.name
      : (user.email?.split("@")[0] ?? "User");
  return { id: user.id ?? "", name, email: user.email ?? "", role };
}

// Also check the profiles table for the real role (user_metadata can be stale).
async function enrichProfileFromDb(u: UserProfile): Promise<UserProfile> {
  if (!isSupabaseConfigured) return u;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .maybeSingle();
    if (data?.role && (data.role === "admin" || data.role === "clipper" || data.role === "creator")) {
      return { ...u, role: data.role as Role };
    }
  } catch {
    /* non-fatal */
  }
  return u;
}

// Backfill a public `profiles` row for any signed-in user.
// SECURITY: Never trust u.role from client. New profiles always get "clipper".
// Role promotion is exclusively via adminProfilePatch (admin-controlled).
async function ensureProfile(u: UserProfile) {
  if (!isSupabaseConfigured) return;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", u.id)
      .maybeSingle();
    if (!data) {
      await supabase.from("profiles").insert({
        id: u.id,
        name: u.name,
        email: u.email,
        role: "clipper",
        status: "active",
      });
    }
  } catch {
    /* non-fatal */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Supabase not configured — auth is unavailable. Loading finishes
      // immediately so the UI can render a "configure Supabase" message.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    let active = true;

    const apply = (u: UserProfile | null) => {
      if (!active) return;
      if (u) {
        // SECURITY: Set isSignedIn immediately, but do NOT set role yet.
        // Role stays null until DB enrichment completes, so guards block rendering.
        setUser(u);
        setIsSignedIn(true);
        ensureProfile(u);

        // Enrich role from profiles table (source of truth, NEVER trust user_metadata)
        void (async () => {
          const enriched = await enrichProfileFromDb(u);
          if (!active) return;
          setUser(enriched);
          setRole(enriched.role);
          // Load admin permissions from the database.
          if (enriched.role === "admin") {
            try {
              const { data } = await supabase
                .from("admin_permissions")
                .select("permission")
                .eq("admin_id", enriched.id);
              if (!active) return;
              if (data && data.length) {
                const perms = data.map((d) => String(d.permission));
                setUser((prev) =>
                  prev ? { ...prev, permissions: perms } : prev,
                );
              }
            } catch {
              /* non-fatal */
            }
          }
          setLoading(false);
        })();
      } else {
        setUser(null);
        setRole(null);
        setIsSignedIn(false);
        setLoading(false);
      }
    };

    // Initialize from the current Supabase Auth session.
    supabase.auth
      .getSession()
      .then(({ data }) => apply(profileFromUser(data.session?.user ?? null)))
      .catch(() => {
        if (active) {
          setIsSignedIn(false);
          setLoading(false);
        }
      });

    // Keep state in sync with Supabase Auth events (sign-in, sign-out,
    // token refresh, password recovery, etc.).
    // With per-tab storageKey, the BroadcastChannel is isolated — events
    // from other tabs never reach this listener.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(profileFromUser(session?.user ?? null));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthValue["signIn"] = async (creds) => {
    setError(null);

    if (!isSupabaseConfigured) {
      const msg = "Authentication requires Supabase. Please configure your environment.";
      setError(msg);
      throw new Error(msg);
    }

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: creds.email,
        password: creds.password,
      });

    if (signInError || !data.session) {
      const msg = mapError(
        signInError ?? { message: "Unable to sign in. Please try again." },
      );
      setError(msg);
      throw new Error(msg);
    }

    const base = profileFromUser(data.session.user ?? null);
    if (base) {
      ensureProfile(base);
      // SECURITY: Return enriched profile from DB, not client-trusted one
      const enriched = await enrichProfileFromDb(base);
      return enriched;
    }
    return null;
  };

  const signUp: AuthValue["signUp"] = async (data) => {
    setError(null);
    // SECURITY: Never allow self-assigning admin role via signup.
    const safeRole = data.role === "admin" ? "clipper" : data.role;

    if (!isSupabaseConfigured) {
      const msg = "Authentication requires Supabase. Please configure your environment.";
      setError(msg);
      throw new Error(msg);
    }

    const { data: res, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name, role: safeRole } },
    });
    if (signUpError) {
      const msg = mapError(signUpError);
      setError(msg);
      throw new Error(msg);
    }
    if (!res.session) {
      const msg = "Please check your email to confirm your account.";
      setError(msg);
      throw new Error(msg);
    }
    const base = profileFromUser(res.user ?? null);
    if (base) ensureProfile(base);
  };

  const signOut: AuthValue["signOut"] = async () => {
    setError(null);
    if (isSupabaseConfigured) {
      // scope: 'local' ensures only THIS tab is signed out.
      // Other tabs retain their own sessions.
      await supabase.auth.signOut({ scope: "local" });
    }
    setUser(null);
    setRole(null);
    setIsSignedIn(false);
  };

  return (
    <AuthContext.Provider
      value={{ isSignedIn, role, user, loading, error, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
