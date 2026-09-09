"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutGrid,
  Megaphone,
  Film,
  Wallet,
  Settings,
  BarChart3,
  Menu,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AuthGuard } from "@/components/AuthGuard";
import { MobileSidebar } from "@/components/MobileSidebar";

const NAV = [
  { href: "/creator", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/creator/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creator/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/creator/submissions", label: "Submissions", icon: Film },
  { href: "/creator/wallet", label: "Wallet", icon: Wallet },
  { href: "/creator/settings", label: "Settings", icon: Settings },
];

const GROUPS = [
  { label: "Work", items: NAV.slice(0, 4) },
  { label: "Money", items: NAV.slice(4, 5) },
  { label: "Account", items: NAV.slice(5, 6) },
];

export default function CreatorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthGuard role="creator">
      <main className="min-h-screen bg-background">
        <TopBar />
        <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-5 left-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-md sm:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          {/* Mobile sidebar */}
          <MobileSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            nav={NAV}
            title="ClipTwo"
          />

          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-24 space-y-6">
              {GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
                    {group.label}
                  </p>
                  <nav className="flex flex-col gap-1">
                    {group.items.map((n) => {
                      const active = n.exact
                        ? pathname === n.href
                        : pathname === n.href ||
                          pathname.startsWith(n.href + "/");
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-all duration-150 ${
                            active
                              ? "bg-foreground text-white shadow-sm"
                              : "text-muted hover:bg-accent-soft hover:text-foreground"
                          }`}
                        >
                          <n.icon
                            size={18}
                            strokeWidth={active ? 2 : 1.5}
                            className={active ? "text-white" : ""}
                          />
                          {n.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </AuthGuard>
  );
}
