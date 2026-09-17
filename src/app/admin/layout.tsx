"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  LayoutGrid,
  Users,
  Film,
  Megaphone,
  Banknote,
  ShieldAlert,
  BarChart3,
  Settings,
  Menu,
  LogOut,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AdminGuard } from "@/components/AdminGuard";
import { MobileSidebar } from "@/components/MobileSidebar";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/admin/clippers", label: "Users", icon: Users },
  { href: "/admin/creators", label: "Creators", icon: Users },
  { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/admin/clips", label: "Submissions", icon: Film },
  { href: "/admin/payouts", label: "Payouts", icon: Banknote },
  { href: "/admin/risk", label: "Disputes", icon: ShieldAlert },
  { href: "/admin/audit", label: "Analytics", icon: BarChart3 },
  { href: "/admin/website", label: "Finance", icon: Banknote },
  { href: "/admin/backend", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AdminGuard>
      <main className="min-h-screen bg-background">
        <TopBar />
        <div className="mx-auto flex max-w-[1280px] gap-8 px-4 py-6 sm:px-6 sm:py-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-4 left-4 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-lg hover:opacity-90 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          {/* Mobile sidebar */}
          <MobileSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            nav={NAV}
            title="Admin"
          />

          {/* Desktop sidebar */}
          <aside className="hidden w-56 shrink-0 lg:block">
            <div className="sticky top-20 space-y-6">
              <nav className="flex flex-col">
                {NAV.map((n) => {
                  const active = n.exact
                    ? pathname === n.href
                    : pathname === n.href ||
                      (pathname.startsWith(n.href + "/") &&
                        !NAV.some(
                          (other) =>
                            other.href !== n.href &&
                            !other.exact &&
                            other.href.startsWith(n.href + "/") &&
                            (pathname === other.href ||
                              pathname.startsWith(other.href + "/")),
                        ));
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-[6px] text-[15px] transition-colors duration-150 ${
                        active
                          ? "bg-accent-soft text-foreground font-semibold"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <n.icon size={18} /> {n.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-border/60 pt-4">
                <Link
                  href="/login"
                  className="flex items-center gap-2 rounded-[10px] px-2.5 py-[6px] text-[15px] text-red transition-colors duration-150 hover:bg-red/5"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                  Log Out
                </Link>
              </div>
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </AdminGuard>
  );
}
