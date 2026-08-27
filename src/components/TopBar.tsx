"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function TopBar({
  active,
}: {
  active?: "home" | "clipper" | "creator" | "campaigns";
}) {
  const { isSignedIn, user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initial = user?.name?.[0]?.toUpperCase() ?? "U";
  const isClipper = user?.role === "clipper";
  const isCreator = user?.role === "creator";

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs text-white">
            C
          </span>
          cliptwo
        </Link>

        <nav className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {!isCreator && (
            <Link
              href="/clipper"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active === "clipper"
                  ? "bg-accent-soft text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Clipper
            </Link>
          )}
          {!isClipper && (
            <Link
              href="/creator"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active === "creator"
                  ? "bg-accent-soft text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Creator
            </Link>
          )}
        </nav>

        {isSignedIn ? (
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-label="Account menu"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
            >
              {initial}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border bg-card shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <Link
                  href={user?.role === "creator" ? "/creator" : "/clipper/settings"}
                  className="block px-4 py-2.5 text-sm hover:bg-accent-soft"
                >
                  Settings
                </Link>
                <button
                  onClick={() => {
                    signOut();
                    setOpen(false);
                    router.push("/");
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-accent-soft"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
