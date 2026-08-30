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
  Link2,
  Menu,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AuthGuard } from "@/components/AuthGuard";
import { MobileSidebar } from "@/components/MobileSidebar";

const NAV = [
  { href: "/clipper", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/clipper/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/clipper/submissions", label: "My Submissions", icon: Film },
  { href: "/clipper/wallet", label: "Wallet", icon: Wallet },
  { href: "/clipper/accounts", label: "Connected accounts", icon: Link2 },
  { href: "/clipper/settings", label: "Settings", icon: Settings },
];

export default function ClipperLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthGuard role="clipper">
      <main className="min-h-screen bg-background">
        <TopBar active="clipper" />
        <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-4 left-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg sm:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          {/* Mobile sidebar */}
          <MobileSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            nav={NAV}
            title="Menu"
          />

          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 sm:block">
            <div className="sticky top-20">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                Menu
              </p>
              <nav className="flex flex-col gap-1">
                {NAV.map((n) => {
                  const active = n.exact
                    ? pathname === n.href
                    : pathname.startsWith(n.href);
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
    </AuthGuard>
  );
}
