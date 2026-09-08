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
      className={`group relative rounded-xl border bg-card p-5 transition-shadow hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${
        accent ? "border-foreground/10" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-muted transition-colors group-hover:bg-foreground/[0.06]">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
