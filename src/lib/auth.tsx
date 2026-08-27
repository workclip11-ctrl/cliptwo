"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Role = "clipper" | "creator";

interface AuthValue {
  isSignedIn: boolean;
  role: Role | null;
  signIn: (role?: Role) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    setIsSignedIn(localStorage.getItem("cliptwo-auth") === "1");
    const r = localStorage.getItem("cliptwo-role") as Role | null;
    if (r === "clipper" || r === "creator") setRole(r);
  }, []);

  const signIn = (r?: Role) => {
    localStorage.setItem("cliptwo-auth", "1");
    if (r) {
      localStorage.setItem("cliptwo-role", r);
      setRole(r);
    }
    setIsSignedIn(true);
  };

  const signOut = () => {
    localStorage.removeItem("cliptwo-auth");
    localStorage.removeItem("cliptwo-role");
    setIsSignedIn(false);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ isSignedIn, role, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
