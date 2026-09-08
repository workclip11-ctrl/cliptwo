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
      className={`group flex flex-col justify-between rounded-xl border bg-card px-5 py-4 transition-all duration-200 hover:border-foreground/10 hover:shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${
        accent ? "border-foreground/8" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-muted transition-colors duration-200 group-hover:bg-foreground/[0.06]">
            {icon}
          </span>
        ) : null}
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <div className="mt-3">
        <p className="text-[26px] font-bold leading-none tracking-tight">
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 text-[11px] text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}
