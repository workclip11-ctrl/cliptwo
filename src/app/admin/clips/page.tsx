"use client";

import { useState } from "react";
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
  History,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf } from "@/lib/finance";
import type { ClipStatus } from "@/lib/types";

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const { user } = useAuth();
  const actor = user?.email ?? user?.name ?? "Admin";
  const [filter, setFilter] = useState<ClipStatus | "all">(() => {
    if (typeof window === "undefined") return "all";
    const f = new URLSearchParams(window.location.search).get("filter");
    return f && FILTERS.some((x) => x.key === f) ? (f as ClipStatus | "all") : "all";
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);

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
                      onClick={() => setClipStatus(k.id, "approved", undefined, actor)}
                      className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-xs font-medium text-green"
                    >
                      <Check size={13} /> Approve
                    </button>
                    {rejectingId === k.id ? (
                      <div className="w-full space-y-2 rounded-lg border border-red/30 bg-red/5 p-3">
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason (e.g. Campaign rule violation)"
                          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                        />
                        <textarea
                          value={rejectDetails}
                          onChange={(e) => setRejectDetails(e.target.value)}
                          rows={2}
                          placeholder="Details (optional)"
                          className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setClipStatus(k.id, "rejected", {
                                rejectionReason: rejectReason || "Rejected by admin",
                                rejectionDetails: rejectDetails || undefined,
                              }, actor);
                              setRejectingId(null);
                              setRejectReason("");
                              setRejectDetails("");
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                          >
                            <Ban size={13} /> Confirm reject
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason("");
                              setRejectDetails("");
                            }}
                            className="rounded-md border px-2.5 py-1 text-xs font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setRejectingId(k.id);
                          setRejectReason("");
                          setRejectDetails("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                      >
                        <Ban size={13} /> Reject
                      </button>
                    )}
                  </>
                )}
                {k.status === "approved" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <Clock size={13} /> Mark payable
                  </button>
                )}
                {k.status === "payable" && (
                  <button
                    onClick={() => setClipStatus(k.id, "processing", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber"
                  >
                    <PlayCircle size={13} /> Start payout
                  </button>
                )}
                {k.status === "processing" && (
                  <>
                    <button
                      onClick={() => setClipStatus(k.id, "paid", undefined, actor)}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500"
                    >
                      <Wallet size={13} /> Mark paid
                    </button>
                    <button
                      onClick={() => {
                        setFailingId(k.id);
                        setFailReason("");
                      }}
                      className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                    >
                      <Ban size={13} /> Fail
                    </button>
                  </>
                )}
                {failingId === k.id && (
                  <div className="mt-2 space-y-2 rounded-md border border-red/30 bg-red/5 p-2.5">
                    <p className="text-xs font-medium text-red">Why did the payout fail?</p>
                    <textarea
                      value={failReason}
                      onChange={(e) => setFailReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. UPI verification failed"
                      className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setClipStatus(k.id, "failed", {
                            failureReason: failReason || "Payout failed",
                          }, actor);
                          setFailingId(null);
                          setFailReason("");
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                      >
                        <Ban size={13} /> Confirm fail
                      </button>
                      <button
                        onClick={() => {
                          setFailingId(null);
                          setFailReason("");
                        }}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {k.status === "failed" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                )}
                {k.status === "paid" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    title="Revert to payable (not yet released)"
                  >
                    <Undo2 size={13} /> Revert
                  </button>
                )}
                {k.status === "held" && (
                  <button
                    onClick={() => setClipStatus(k.id, "payable", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <Undo2 size={13} /> Release
                  </button>
                )}
                {k.status === "rejected" && (
                  <button
                    onClick={() => setClipStatus(k.id, "pending", undefined, actor)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    title="Send back to review queue"
                  >
                    <Clock size={13} /> Reopen
                  </button>
                )}
                <button
                  onClick={() => setAuditId(auditId === k.id ? null : k.id)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft ${
                    auditId === k.id ? "bg-accent-soft" : ""
                  }`}
                >
                  <History size={13} /> Audit
                  {k.audit?.length ? ` (${k.audit.length})` : ""}
                </button>
              </div>
              {auditId === k.id && k.audit && k.audit.length > 0 && (
                <div className="mt-3 rounded-lg border bg-background/50 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Audit trail
                  </p>
                  <ol className="space-y-2">
                    {k.audit.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <div className="min-w-0">
                          <p className="font-medium capitalize">{e.action}</p>
                          <p className="text-muted">
                            {e.by ? `${e.by} · ` : ""}
                            {fmtDateTime(e.at)}
                          </p>
                          {e.note && (
                            <p className="mt-0.5 text-muted">{e.note}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
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
