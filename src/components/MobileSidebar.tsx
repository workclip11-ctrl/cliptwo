"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
}

export function MobileSidebar({
  open,
  onClose,
  nav,
  title,
}: {
  open: boolean;
  onClose: () => void;
  nav: NavItem[];
  title: string;
}) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 cursor-pointer bg-black/40"
        onClick={onClose}
      />
      <div
        ref={ref}
        className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-card shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <p className="text-lg font-bold tracking-tight">{title}</p>
          <button
            onClick={onClose}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg hover:bg-accent-soft"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 p-4">
          {nav.map((n) => {
            const active = n.exact
              ? pathname === n.href
              : pathname === n.href || pathname.startsWith(n.href + "/");
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={onClose}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-[15px] font-medium transition-colors ${
                  active
                    ? "bg-accent-soft text-foreground"
                    : "text-muted hover:bg-accent-soft/60 hover:text-foreground"
                }`}
              >
                <n.icon size={18} /> {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
