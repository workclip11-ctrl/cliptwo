"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type Role = "clipper" | "creator";

export interface UserProfile {
  name: string;
  email: string;
  role: Role;
}

interface AuthValue {
  isSignedIn: boolean;
  role: Role | null;
  user: UserProfile | null;
  signIn: (role: Role, profile?: Partial<UserProfile>) => void;
  signUp: (profile: UserProfile) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("cliptwo-user");
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as UserProfile;
    if (u.role === "clipper" || u.role === "creator") return u;
  } catch {
    /* ignore corrupt value */
  }
  return null;
}

function readRole(): Role | null {
  if (typeof window === "undefined") return null;
  const r = localStorage.getItem("cliptwo-role");
  return r === "clipper" || r === "creator" ? r : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("cliptwo-auth") === "1",
  );
  const [role, setRole] = useState<Role | null>(readRole);
  const [user, setUser] = useState<UserProfile | null>(readUser);

  const signIn = (r: Role, profile?: Partial<UserProfile>) => {
    const full: UserProfile = {
      name: profile?.name ?? user?.name ?? "User",
      email: profile?.email ?? user?.email ?? "",
      role: r,
    };
    localStorage.setItem("cliptwo-auth", "1");
    localStorage.setItem("cliptwo-role", r);
    localStorage.setItem("cliptwo-user", JSON.stringify(full));
    setRole(r);
    setUser(full);
    setIsSignedIn(true);
  };

  const signUp = (p: UserProfile) => {
    localStorage.setItem("cliptwo-auth", "1");
    localStorage.setItem("cliptwo-role", p.role);
    localStorage.setItem("cliptwo-user", JSON.stringify(p));
    setRole(p.role);
    setUser(p);
    setIsSignedIn(true);
  };

  const signOut = () => {
    localStorage.removeItem("cliptwo-auth");
    localStorage.removeItem("cliptwo-role");
    localStorage.removeItem("cliptwo-user");
    setIsSignedIn(false);
    setRole(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isSignedIn, role, user, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
