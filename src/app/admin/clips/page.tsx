"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Ban,
  Wallet,
  Undo2,
  Clock,
  Banknote,
  RefreshCw,
  AlertTriangle,
  PlayCircle,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf } from "@/lib/finance";
import type { ClipStatus } from "@/lib/types";

const FILTERS: Array<{ key: ClipStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "payable", label: "Payable" },
  { key: "processing", label: "Processing" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "held", label: "Held" },
  { key: "rejected", label: "Rejected" },
];

export default function AdminClips() {
  const { clips, campaigns, setClipStatus } = useStore();
  const [filter, setFilter] = useState<ClipStatus | "all">("all");

  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filter");
    if (f && FILTERS.some((x) => x.key === f)) setFilter(f as ClipStatus | "all");
  }, []);

  const fin = financeOf(clips, campaigns);
  const list = [...clips]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .filter((k) => (filter === "all" ? true : k.status === filter));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review &amp; payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Approve submitted clips, then move them through payable → processing → paid.
          Every number here is derived from the clip ledger.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Banknote size={18} className="text-amber" />
          <div>
            <p className="font-mono text-lg font-semibold">{rup(fin.outstanding)}</p>
            <p className="text-xs text-muted">Outstanding payable</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Wallet size={18} className="text-blue-500" />
          <div>
            <p className="font-mono text-lg font-semibold">{rup(fin.paid)}</p>
            <p className="text-xs text-muted">Released to clippers</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <AlertTriangle size={18} className="text-purple-400" />
          <div>
            <p className="font-mono text-lg font-semibold">{rup(fin.held)}</p>
            <p className="text-xs text-muted">Held / disputed</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key ? "bg-accent text-white" : "text-muted hover:bg-accent-soft"
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
                  {k.videoUrl && (
                    <a
                      href={k.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-accent hover:underline"
                    >
                      View clip ↗
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{fmtViews(k.views)}</span>
                  <span className="font-mono text-sm text-amber">
                    {rup(clipEarnings(k, campaigns))}
                  </span>
                  <StatusPill status={k.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
                {k.status === "approved" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable")}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <Clock size={13} /> Mark payable
                  </button>
                )}
                {k.status === "payable" && (
                  <button
                    onClick={() => setClipStatus(k.id, "processing")}
                    className="inline-flex items-center gap-1 rounded-md bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber"
                  >
                    <PlayCircle size={13} /> Start payout
                  </button>
                )}
                {k.status === "processing" && (
                  <>
                    <button
                      onClick={() => setClipStatus(k.id, "paid")}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500"
                    >
                      <Wallet size={13} /> Mark paid
                    </button>
                    <button
                      onClick={() => setClipStatus(k.id, "failed")}
                      className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                    >
                      <Ban size={13} /> Fail
                    </button>
                  </>
                )}
                {k.status === "failed" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable")}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                )}
                {k.status === "paid" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable")}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    title="Revert to payable (not yet released)"
                  >
                    <Undo2 size={13} /> Revert
                  </button>
                )}
                {k.status === "held" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable")}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <Undo2 size={13} /> Release
                  </button>
                )}
                {k.status === "rejected" && (
                  <button
                    onClick={() => setClipStatus(k.id, "pending")}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    title="Send back to review queue"
                  >
                    <Clock size={13} /> Reopen
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
