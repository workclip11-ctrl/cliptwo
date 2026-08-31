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

// Per-tab logout flag. Unlike Supabase's global signOut (which clears the
// shared localStorage session and logs out every tab), this lets "logout"
// apply to only the current tab while other tabs stay signed in.
const TAB_LOGOUT_KEY = "cliptwo_tab_logged_out";
const TAB_UID_KEY = "cliptwo_tab_uid";
const LOCAL_SESSION_KEY = "cliptwo_local_session";

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

function saveLocalSession(profile: UserProfile) {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(profile));
  }
}

function loadLocalSession(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function clearLocalSession() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(LOCAL_SESSION_KEY);
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const apply = (u: UserProfile | null) => {
      if (!active) return;
      if (u && !isTabLoggedOut()) {
        setUser(u);
        setRole(u.role);
        setIsSignedIn(true);
        ensureProfile(u);
        // Load this admin's fine-grained permissions so the UI matches the
        // database RLS enforcement (the super-admin needs no rows).
        if (u.role === "admin" && isSupabaseConfigured) {
          void (async () => {
            try {
              const { data } = await supabase
                .from("admin_permissions")
                .select("permission")
                .eq("admin_id", u.id);
              if (!active) return;
              if (data && data.length) {
                const perms = data.map((d) => String(d.permission));
                setUser((prev) => (prev ? { ...prev, permissions: perms } : prev));
              }
            } catch {
              /* non-fatal */
            }
          })();
        }
      } else {
        setUser(null);
        setRole(null);
        setIsSignedIn(false);
      }
      setLoading(false);
    };

    // ── Local mode: restore session from sessionStorage ──
    if (!isSupabaseConfigured) {
      const local = loadLocalSession();
      if (local && !isTabLoggedOut()) {
        apply(local);
      } else {
        apply(null);
      }
      return () => { active = false; };
    }

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

    // ── Local mode: simulate auth when Supabase is not configured ──
    if (!isSupabaseConfigured) {
      const email = creds.email.toLowerCase().trim();
      const role: Role =
        r === "admin" || email === "workclip11@gmail.com"
          ? "admin"
          : r === "creator"
            ? "creator"
            : "clipper";
      const profile: UserProfile = {
        id: `local-${email.replace(/[^a-z0-9]/g, "-")}`,
        name: creds.name || email.split("@")[0],
        email,
        role,
      };
      markTabSession(profile.id);
      saveLocalSession(profile);
      setUser(profile);
      setRole(profile.role);
      setIsSignedIn(true);
      return profile;
    }

    const first = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });

    // Do NOT fall back to a shared session on failure. Reusing getSession()
    // here would silently log a failed login in as whatever account is already
    // in storage (e.g. admin) — a privilege-escalation bug.
    if (first.error || !first.data.session) {
      const msg = mapError(
        first.error ?? { message: "Unable to sign in. Please try again." },
      );
      setError(msg);
      throw new Error(msg);
    }
    const session = first.data.session;

    const base = profileFromUser(session.user ?? null);
    if (base) {
      markTabSession(base.id);
      setUser(base);
      setRole(base.role);
      setIsSignedIn(true);
      ensureProfile(base);
      return base;
    }
    setIsSignedIn(true);
    return null;
  };

  const signUp: AuthValue["signUp"] = async (data) => {
    setError(null);
    // SECURITY: Never allow self-assigning admin role via signup.
    const safeRole = data.role === "admin" ? "clipper" : data.role;

    // ── Local mode: simulate auth when Supabase is not configured ──
    if (!isSupabaseConfigured) {
      const profile: UserProfile = {
        id: `local-${data.email.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        name: data.name,
        email: data.email,
        role: safeRole as Role,
      };
      if (typeof window !== "undefined")
        sessionStorage.removeItem(TAB_LOGOUT_KEY);
      markTabSession(profile.id);
      saveLocalSession(profile);
      setUser(profile);
      setRole(profile.role);
      setIsSignedIn(true);
      ensureProfile(profile);
      return;
    }

    const { data: res, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { name: data.name, role: safeRole } },
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
      role: safeRole as Role,
    });
    setRole(safeRole as Role);
    setIsSignedIn(true);
    ensureProfile({
      id: res.user?.id ?? "",
      name: data.name,
      email: data.email,
      role: safeRole as Role,
    });
  };

  const signOut: AuthValue["signOut"] = async () => {
    // Per-tab logout: flag this tab only. We deliberately do NOT call
    // supabase.auth.signOut() because that clears the shared session and
    // would log out every tab.
    if (typeof window !== "undefined")
      sessionStorage.setItem(TAB_LOGOUT_KEY, "1");
    clearLocalSession();
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
