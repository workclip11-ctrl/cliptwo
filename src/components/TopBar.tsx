"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Notification } from "@/lib/notifications";

function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    async function load() {
      try {
        const { data } = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (!cancelled && data) setNotifications(data as Notification[]);
      } catch {
        // silently ignore in local mode
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", n.id);
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, [notifications]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-accent-soft hover:text-foreground"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border bg-card shadow-lg sm:w-80">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                No notifications yet
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`border-b px-4 py-3 last:border-b-0 ${!n.read ? "bg-accent-soft/50" : ""}`}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {new Date(n.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar({
  active,
}: {
  active?: "home" | "clipper" | "creator" | "campaigns" | "admin";
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
  const isAdmin = user?.role === "admin";
  const logoHref = isAdmin
    ? "/admin"
    : isCreator
      ? "/creator"
      : isClipper
        ? "/clipper"
        : "/";

  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href={logoHref}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs text-white">
            C
          </span>
          cliptwo
        </Link>

        <nav className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {isAdmin ? (
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active === "admin"
                  ? "bg-accent-soft text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Admin
            </Link>
          ) : (
            <>
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
            </>
          )}
        </nav>

        {isSignedIn ? (
          <div className="flex items-center gap-2">
            <NotificationBell userId={user?.id ?? ""} />
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
                  href={
                    isAdmin
                      ? "/admin"
                      : user?.role === "creator"
                        ? "/creator/settings"
                        : "/clipper/settings"
                  }
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
