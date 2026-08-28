"use client";

import { useState } from "react";
import { Check, Ban, Wallet } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import type { ClipStatus } from "@/lib/types";

const FILTERS: Array<{ key: ClipStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminClips() {
  const { clips, campaigns, setClipStatus } = useStore();
  const [filter, setFilter] = useState<ClipStatus | "all">("all");

  const list = [...clips]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .filter((k) => (filter === "all" ? true : k.status === filter));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review &amp; payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Approve submitted clips, reject what doesn&apos;t fit, and mark approved
          clips as paid once funds are released.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-accent text-white"
                : "text-muted hover:bg-accent-soft"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((k) => {
          const c = campaigns.find((x) => x.id === k.campaignId);
          return (
            <div key={k.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">@{k.clipper}</p>
                  <p className="truncate text-xs text-muted">{c?.title ?? "Campaign"}</p>
                  <p className="mt-1 truncate text-xs text-muted">{k.caption}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{fmtViews(k.views)}</span>
                  <span className="font-mono text-sm text-amber">
                    {rup(clipEarnings(k, campaigns))}
                  </span>
                  <StatusPill status={k.status} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {k.platform && <PlatformIcon p={k.platform} size={15} />}
                {k.status === "pending" && (
                  <>
                    <button
                      onClick={() => setClipStatus(k.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-xs font-medium text-green"
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      onClick={() => setClipStatus(k.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                    >
                      <Ban size={13} /> Reject
                    </button>
                  </>
                )}
                {(k.status === "approved") && (
                  <button
                    onClick={() => setClipStatus(k.id, "paid")}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500"
                  >
                    <Wallet size={13} /> Mark paid
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted">
            No clips in this view.
          </p>
        )}
      </div>
    </div>
  );
}
