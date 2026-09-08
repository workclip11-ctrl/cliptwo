import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-xl border bg-card px-5 py-4 transition-all hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${
        accent ? "border-foreground/10" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-muted transition-colors group-hover:bg-foreground/[0.06]">
            {icon}
          </span>
        ) : null}
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p className="mt-2.5 pl-0.5 text-2xl font-bold tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 pl-0.5 text-[11px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
