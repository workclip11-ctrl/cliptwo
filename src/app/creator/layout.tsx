"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogOut,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { AuthGuard } from "@/components/AuthGuard";
import { MobileSidebar } from "@/components/MobileSidebar";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/creator", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/creator/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/creator/submissions", label: "Submissions", icon: Film },
  { href: "/creator/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/creator/wallet", label: "Wallet", icon: Wallet },
  { href: "/creator/settings", label: "Settings", icon: Settings },
];

export default function CreatorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthGuard role="creator">
      <main className="min-h-screen bg-background">
        <TopBar />
        <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="fixed bottom-5 left-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-md hover:opacity-90 sm:hidden"
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
            <div className="sticky top-20 space-y-6">
              <nav className="flex flex-col">
                {NAV.map((n) => {
                  const active = n.exact
                    ? pathname === n.href
                    : pathname === n.href ||
                      pathname.startsWith(n.href + "/");
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`flex items-center gap-2 rounded-[10px] px-2.5 py-[6px] text-[15px] transition-colors duration-150 ${
                        active
                          ? "bg-accent-soft text-foreground font-semibold"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <n.icon size={18} strokeWidth={active ? 2 : 1.5} />
                      {n.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-border/60 pt-4">
                <button
                  onClick={() => { signOut(); router.push("/login"); }}
                  className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-[6px] text-[15px] text-red transition-colors duration-150 hover:bg-red/5"
                >
                  <LogOut size={18} strokeWidth={1.5} />
                  Log Out
                </button>
              </div>
            </div>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </AuthGuard>
  );
}
