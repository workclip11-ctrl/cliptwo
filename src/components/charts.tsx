"use client";

import Link from "next/link";
import type { SeriesPoint } from "@/lib/analytics";

export function ChartEmpty({
  label = "Not enough data to chart yet.",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-44 items-center justify-center rounded-xl border border-dashed bg-accent-soft/30 px-4 text-center text-sm text-muted">
      {label}
    </div>
  );
}

// Dependency-free SVG area/line chart. Uses `currentColor` so the caller
// controls the color via a Tailwind text-* class.
export function TimeSeriesChart({
  data,
  height = 180,
  format,
}: {
  data: SeriesPoint[];
  height?: number;
  format?: (v: number) => string;
}) {
  const W = 720;
  const H = height;
  const pad = 10;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 0);
  const n = data.length;

  if (n < 2 || max === 0) {
    return <ChartEmpty />;
  }

  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const linePts = data
    .map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
    .join(" ");
  const areaPts = `${pad},${(H - pad).toFixed(1)} ${linePts} ${(
    W - pad
  ).toFixed(1)},${(H - pad).toFixed(1)}`;
  const lastX = x(n - 1);
  const lastY = y(data[n - 1].value);
  const firstLabel = data[0].label;
  const lastLabel = data[n - 1].label;

  return (
    <div className="text-accent">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-44 w-full"
        role="img"
        aria-label="Trend chart"
      >
        <polygon points={areaPts} fill="currentColor" fillOpacity={0.12} />
        <polyline
          points={linePts}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={lastX} cy={lastY} r={3} fill="currentColor" />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
        <span>{firstLabel}</span>
        <span>
          peak {format ? format(max) : max}
        </span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}

export interface BarItem {
  id?: string;
  label: string;
  value: number;
  href?: string;
}

// Horizontal bar breakdown. Items with `href` become links.
export function BreakdownBars({
  items,
  format,
}: {
  items: BarItem[];
  format?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0 || max === 0) {
    return <ChartEmpty />;
  }
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const pct = Math.round((it.value / max) * 100);
        const bar = (
          <div className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-muted">
              {it.label}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs">
              {format ? format(it.value) : it.value}
            </span>
          </div>
        );
        return it.href ? (
          <Link
            key={it.id ?? it.label}
            href={it.href}
            className="block rounded-md px-1 py-0.5 transition-colors hover:bg-accent-soft/60"
          >
            {bar}
          </Link>
        ) : (
          <div key={it.id ?? it.label}>{bar}</div>
        );
      })}
    </div>
  );
}
