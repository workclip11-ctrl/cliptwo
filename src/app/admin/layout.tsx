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
  Globe,
  Server,
  ShieldAlert,
  History,
  Banknote,
  CreditCard,
  Menu,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AdminGuard } from "@/components/AdminGuard";
import { MobileSidebar } from "@/components/MobileSidebar";

const NAV_GROUPS = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutGrid, exact: true },
      { href: "/admin/clips", label: "Review & payouts", icon: Film },
      { href: "/admin/payouts", label: "Payouts", icon: Banknote },
      { href: "/admin/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/admin/campaigns/payments", label: "Campaign Payments", icon: CreditCard },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/clippers", label: "Clippers", icon: Users },
      { href: "/admin/creators", label: "Creators", icon: Users },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/website", label: "Website", icon: Globe },
      { href: "/admin/backend", label: "Backend", icon: Server },
      { href: "/admin/risk", label: "Risk", icon: ShieldAlert },
      { href: "/admin/audit", label: "Audit Log", icon: History },
    ],
  },
];

const NAV = NAV_GROUPS.flatMap((g) => g.items);

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
            className="fixed bottom-4 left-4 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-lg hover:opacity-90 sm:hidden"
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
          <aside className="hidden w-56 shrink-0 sm:block">
            <div className="sticky top-20 space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">
                    {group.label}
                  </p>
                  <nav className="flex flex-col gap-0.5">
                    {group.items.map((n) => {
                      const active =
                        n.exact
                          ? pathname === n.href
                          : pathname === n.href ||
                            (pathname.startsWith(n.href + "/") &&
                              // only if no more-specific child is also active
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
                          className={`flex cursor-pointer items-center gap-2.5 rounded-[8px] px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
                            active
                              ? "bg-foreground text-background"
                              : "text-muted hover:bg-accent-soft/60 hover:text-foreground"
                          }`}
                        >
                          <n.icon size={15} /> {n.label}
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
    </AdminGuard>
  );
}
