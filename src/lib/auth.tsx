"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase/client";

export type Role = "clipper" | "creator";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
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
    meta.role === "clipper" || meta.role === "creator"
      ? (meta.role as Role)
      : "clipper";
  const name =
    typeof meta.name === "string" && meta.name
      ? meta.name
      : (user.email?.split("@")[0] ?? "User");
  return { id: user.id ?? "", name, email: user.email ?? "", role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        const u = profileFromUser(data.session?.user ?? null);
        if (u) {
          setUser(u);
          setRole(u.role);
          setIsSignedIn(true);
        } else {
          setIsSignedIn(false);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsSignedIn(false);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = profileFromUser(session?.user ?? null);
      if (u) {
        setUser(u);
        setRole(u.role);
        setIsSignedIn(true);
      } else {
        setUser(null);
        setRole(null);
        setIsSignedIn(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthValue["signIn"] = async (r, creds) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });
    if (error) {
      const msg = mapError(error);
      setError(msg);
      throw new Error(msg);
    }
    const { data } = await supabase.auth.getUser();
    const u = profileFromUser(data.user);
    if (u) {
      const finalRole = u.role === "clipper" || u.role === "creator" ? u.role : r;
      const profile = { ...u, role: finalRole };
      setUser(profile);
      setRole(finalRole);
      setIsSignedIn(true);
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
    setUser({ id: res.user?.id ?? "", name: data.name, email: data.email, role: data.role });
    setRole(data.role);
    setIsSignedIn(true);
  };

  const signOut: AuthValue["signOut"] = async () => {
    await supabase.auth.signOut();
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
