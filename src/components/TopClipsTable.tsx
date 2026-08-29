"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { clipCPM } from "@/lib/analytics";
import type { Campaign, Clip } from "@/lib/types";

export function TopClipsTable({
  clips,
  campaigns,
}: {
  clips: Clip[];
  campaigns: Campaign[];
}) {
  const rows = [...clips].sort((a, b) => b.views - a.views).slice(0, 10);

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed bg-accent-soft/30 text-sm text-muted">
        No clips submitted yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted">
            <th className="px-3 py-2.5 font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Clip</th>
            <th className="px-3 py-2.5 font-medium">Clipper</th>
            <th className="px-3 py-2.5 font-medium">Platform</th>
            <th className="px-3 py-2.5 text-right font-medium">Views</th>
            <th className="px-3 py-2.5 text-right font-medium">Engagement</th>
            <th className="px-3 py-2.5 text-right font-medium">CPM</th>
            <th className="px-3 py-2.5 text-right font-medium">Amount paid</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((k, i) => {
            const camp = campaigns.find((c) => c.id === k.campaignId);
            const eng =
              k.engagement
                ? (k.engagement.likes ?? 0) +
                  (k.engagement.comments ?? 0) +
                  (k.engagement.shares ?? 0)
                : 0;
            const earned = clipEarnings(k, campaigns);
            return (
              <tr key={k.id} className="hover:bg-accent-soft/30">
                <td className="px-3 py-3 font-mono text-muted">{i + 1}</td>
                <td className="px-3 py-3">
                  <Link
                    href={`/clip/${k.id}`}
                    className="line-clamp-1 max-w-[220px] font-medium hover:underline underline-offset-2"
                  >
                    {k.caption}
                  </Link>
                  <p className="truncate text-xs text-muted">{camp?.title}</p>
                </td>
                <td className="px-3 py-3">
                  <span className="font-medium">@{k.clipper}</span>
                </td>
                <td className="px-3 py-3">
                  <PlatformIcon p={k.platform ?? "Instagram"} size={15} />
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {fmtViews(k.views)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-muted">
                  {eng > 0 ? fmtViews(eng) : "—"}
                </td>
                <td className="px-3 py-3 text-right font-mono">
                  {rup(clipCPM(k, campaigns))}
                </td>
                <td className="px-3 py-3 text-right font-mono font-semibold">
                  {rup(earned)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
