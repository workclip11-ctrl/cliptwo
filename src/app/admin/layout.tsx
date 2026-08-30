"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LayoutGrid, Users, Film, Megaphone, Globe, Server, ShieldAlert } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AdminGuard } from "@/components/AdminGuard";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/admin/clippers", label: "Clippers", icon: Users },
  { href: "/admin/creators", label: "Creators", icon: Users },
  { href: "/admin/clips", label: "Review & payouts", icon: Film },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/website", label: "Website", icon: Globe },
  { href: "/admin/backend", label: "Backend", icon: Server },
  { href: "/admin/risk", label: "Risk", icon: ShieldAlert },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AdminGuard>
      <main className="min-h-screen bg-background">
        <TopBar active="admin" />
        <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
          <aside className="hidden w-56 shrink-0 sm:block">
            <div className="sticky top-20">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                Admin
              </p>
              <nav className="flex flex-col gap-1">
                {NAV.map((n) => {
                  const active = n.exact
                    ? pathname === n.href
                    : pathname === n.href || pathname.startsWith(n.href + "/");
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-accent-soft text-foreground"
                          : "text-muted hover:bg-accent-soft/60 hover:text-foreground"
                      }`}
                    >
                      <n.icon size={16} /> {n.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </AdminGuard>
  );
}
