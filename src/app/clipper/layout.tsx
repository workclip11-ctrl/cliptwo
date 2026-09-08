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
        <TopBar />
        <div className="mx-auto flex max-w-6xl gap-6 px-4 py-5 sm:px-6 sm:py-6">
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
          <aside className="hidden w-48 shrink-0 lg:block">
            <div className="sticky top-20">
              <nav className="flex flex-col gap-px">
                {NAV.map((n) => {
                  const active = n.exact
                    ? pathname === n.href
                    : pathname.startsWith(n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-all duration-150 ${
                        active
                          ? "bg-foreground text-white shadow-sm"
                          : "text-muted hover:bg-accent-soft hover:text-foreground"
                      }`}
                    >
                      <n.icon
                        size={15}
                        strokeWidth={active ? 2 : 1.5}
                        className={active ? "text-white" : ""}
                      />
                      {n.label}
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
