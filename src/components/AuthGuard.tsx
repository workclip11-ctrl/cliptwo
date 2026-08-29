"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth, type Role } from "@/lib/auth";

export function AuthGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { isSignedIn, role: current, loading } = useAuth();
  const router = useRouter();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!mounted || loading) return;
    if (!isSignedIn) {
      router.replace("/login");
    } else if (current && current !== role) {
      router.replace(current === "clipper" ? "/clipper" : "/creator");
    }
  }, [mounted, loading, isSignedIn, current, role, router]);

  if (!mounted || loading || !isSignedIn || (current && current !== role)) return null;
  return <>{children}</>;
}
