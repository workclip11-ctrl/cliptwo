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
}

// Per-tab logout flag. Unlike Supabase's global signOut (which clears the
// shared localStorage session and logs out every tab), this lets "logout"
// apply to only the current tab while other tabs stay signed in.
const TAB_LOGOUT_KEY = "cliptwo_tab_logged_out";
const TAB_UID_KEY = "cliptwo_tab_uid";

function isTabLoggedOut() {
  return (
    typeof window !== "undefined" &&
    sessionStorage.getItem(TAB_LOGOUT_KEY) === "1"
  );
}

function tabUid() {
  return typeof window !== "undefined"
    ? sessionStorage.getItem(TAB_UID_KEY)
    : null;
}

function markTabSession(id: string) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(TAB_UID_KEY, id);
    sessionStorage.removeItem(TAB_LOGOUT_KEY);
  }
}

interface AuthValue {
  isSignedIn: boolean;
  role: Role | null;
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  signIn: (
    role: Role,
    creds: { email: string; password: string; name?: string },
  ) => Promise<UserProfile | null>;
  signUp: (data: UserProfile & { password: string }) => Promise<void>;
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

// Backfill a public `profiles` row for any signed-in user. This lets the admin
// panel list and manage accounts even for users created before profiles existed.
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
        role: u.role,
        status: "active",
      });
    }
  } catch {
    /* non-fatal */
  }
}

// Resolve the authoritative role from the public `profiles` table (which the
// admin seed sets explicitly), falling back to auth metadata for brand-new
// users who don't have a profile row yet.
async function resolveUser(user: UserProfile | null): Promise<UserProfile | null> {
  if (!user) return null;
  if (!isSupabaseConfigured) return user;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    if (
      data?.role === "clipper" ||
      data?.role === "creator" ||
      data?.role === "admin"
    ) {
      return { ...user, role: data.role };
    }
  } catch {
    /* fall back to metadata below */
  }
  return user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const apply = async (u: UserProfile | null) => {
      if (!active) return;
      const resolved = await resolveUser(u);
      if (resolved && !isTabLoggedOut()) {
        setUser(resolved);
        setRole(resolved.role);
        setIsSignedIn(true);
        ensureProfile(resolved);
      } else {
        setUser(null);
        setRole(null);
        setIsSignedIn(false);
      }
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(profileFromUser(data.session?.user ?? null)))
      .catch(() => {
        if (active) {
          setIsSignedIn(false);
          setLoading(false);
        }
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const incoming = profileFromUser(session?.user ?? null);
      // Ignore cross-tab session changes that switch this tab to a different
      // user, so each tab keeps its own identity (e.g. a tab signed in as
      // creator won't flip to clipper when another tab signs in as clipper).
      if (incoming && tabUid() && incoming.id !== tabUid()) return;
      apply(incoming);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthValue["signIn"] = async (r, creds) => {
    setError(null);
    const first = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });

    // Prefer the session from sign-in. If that fails because a session
    // already exists in shared storage (this tab was flagged logged out but
    // the session is still valid), reuse it for this tab instead of
    // erroring out or touching other tabs.
    let session = first.data.session;
    if (first.error || !session) {
      const { data: cur } = await supabase.auth.getSession();
      session = cur.session;
    }
    if (!session) {
      const msg = mapError(
        first.error ?? { message: "Unable to sign in. Please try again." },
      );
      setError(msg);
      throw new Error(msg);
    }

    const base = profileFromUser(session.user ?? null);
    if (base) {
      const profile = (await resolveUser(base)) ?? base;
      markTabSession(profile.id);
      setUser(profile);
      setRole(profile.role);
      setIsSignedIn(true);
      ensureProfile(profile);
      return profile;
    }
    setIsSignedIn(true);
    return null;
  };

  const signUp: AuthValue["signUp"] = async (data) => {
    setError(null);
    const { data: res, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name, role: data.role } },
    });
    if (error) {
      const msg = mapError(error);
      setError(msg);
      throw new Error(msg);
    }
    if (!res.session) {
      const msg = "Please check your email to confirm your account.";
      setError(msg);
      throw new Error(msg);
    }
    if (typeof window !== "undefined")
      sessionStorage.removeItem(TAB_LOGOUT_KEY);
    markTabSession(res.user?.id ?? data.email);
    setUser({
      id: res.user?.id ?? "",
      name: data.name,
      email: data.email,
      role: data.role,
    });
    setRole(data.role);
    setIsSignedIn(true);
    ensureProfile({
      id: res.user?.id ?? "",
      name: data.name,
      email: data.email,
      role: data.role,
    });
  };

  const signOut: AuthValue["signOut"] = async () => {
    // Per-tab logout: flag this tab only. We deliberately do NOT call
    // supabase.auth.signOut() because that clears the shared session and
    // would log out every tab.
    if (typeof window !== "undefined")
      sessionStorage.setItem(TAB_LOGOUT_KEY, "1");
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
