"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isSignedIn, role, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || loading) return;
    if (!isSignedIn) {
      router.replace("/login?admin=1");
    } else if (role !== "admin") {
      router.replace(role === "creator" ? "/creator" : "/clipper");
    }
  }, [mounted, loading, isSignedIn, role, router]);

  if (!mounted || loading || !isSignedIn || role !== "admin") return null;
  return <>{children}</>;
}
