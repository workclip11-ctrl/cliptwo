"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Ban,
  History,
  Search,
  X,
  ShieldAlert,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, campaignBudget } from "@/lib/finance";
import { clipCPM } from "@/lib/analytics";
import type { Campaign, Clip, ClipStatus, FinanceRecord } from "@/lib/types";

function fmtDate(t?: number) {
  if (!t) return "—";
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TABS: Array<{ key: string; label: string; statuses: ClipStatus[] }> = [
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "held", label: "Held", statuses: ["held"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
];

export default function AdminClips() {
  const { clips, campaigns, financeRecords, approveClip, rejectClip, holdClip } = useStore();
  const { user } = useAuth();
  useAutoRefresh();
  const actor = user?.email ?? user?.name ?? "Admin";

  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter");
  const initialTab =
    filterParam === "payable" || filterParam === "paid"
      ? "approved"
      : TABS.some((t) => t.key === filterParam)
        ? filterParam!
        : "pending";

  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);

  const pendingFin = financeOf(financeRecords, (r) => r.status === "pending");
  const processingFin = financeOf(financeRecords, (r) => r.status === "processing");
  const paidFin = financeOf(financeRecords, (r) => r.status === "paid");

  const tabStatuses = TABS.find((t) => t.key === tab)?.statuses ?? [];

  const list = useMemo(() => {
    const matched = clips.filter(
        (k) =>
        tabStatuses.includes(k.status) &&
        (!q ||
          k.clipper.toLowerCase().includes(q.toLowerCase()) ||
          (k.caption ?? "").toLowerCase().includes(q.toLowerCase()) ||
          (campaigns.find((c) => c.id === k.campaignId)?.title ?? "")
            .toLowerCase()
            .includes(q.toLowerCase())),
    );
    return [...matched].sort((a, b) => b.submittedAt - a.submittedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, campaigns, tab, q]);

  const approve = (k: Clip) => {
    const c = campaigns.find((x) => x.id === k.campaignId);
    if (c?.budget && c.budget > 0) {
      const b = campaignBudget(c, financeRecords);
      const additional = clipEarnings(k, campaigns);
      if (b.remaining < additional) {
        alert(
          `Cannot approve: campaign budget would be exceeded.\n` +
            `Budget: ${rup(c.budget)} | Used: ${rup(b.reserved)} | Remaining: ${rup(b.remaining)}\n` +
            `This clip would add: ${rup(additional)}`,
        );
        return;
      }
    }
    approveClip(k.id, actor);
  };

  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count: clips.filter((k) => t.statuses.includes(k.status)).length,
  }));

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Review &amp; payouts
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Approve submitted clips, then move them through payable → processing → paid. Every
          action is written to the clip&apos;s audit trail. Nothing is marked paid until the
          payout provider confirms.
        </p>
      </div>

      {/* ── Summary metrics ─────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {rup(pendingFin.total / 100)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Pending approval</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {rup(processingFin.total / 100)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">In processing</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {rup(paidFin.total / 100)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Released to clippers</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {rup(financeRecords.filter((r) => {
              const clip = clips.find((c) => c.id === r.clipId);
              return clip?.status === "held";
            }).reduce((s, r) => s + r.netAmount, 0) / 100)}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Held / disputed</p>
        </div>
      </div>

      {/* ── Budget warning ──────────────────────────────── */}
      {(() => {
        const atBudget = campaigns.filter(
          (c) => c.status === "budget_reached" || c.status === "near_budget",
        );
        if (atBudget.length === 0) return null;
        return (
          <div className="rounded-[10px] border border-amber/30 bg-amber/5 px-5 py-4">
            <p className="text-[14px] font-medium text-amber">
              {atBudget.length} campaign{atBudget.length === 1 ? " is" : "s are"}{" "}
              {atBudget.length === 1 ? "at" : "near"} budget limit
            </p>
            <p className="mt-1 text-[13px] text-muted">
              New approvals for these campaigns may be blocked. Review budget
              allocation before proceeding.
            </p>
          </div>
        );
      })()}

      {/* ── Tabs + search toolbar ───────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {tabsWithCounts.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                tab === t.key
                  ? "bg-foreground text-background"
                  : "border border-border/50 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[12px] opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clipper, campaign, caption…"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        <div className="overflow-x-auto">
          {tab === "pending" || tab === "held" || tab === "rejected" ? (
            <ReviewTable
              clips={list}
              campaigns={campaigns}
              onApprove={tab === "pending" ? approve : undefined}
              onReject={tab === "pending" ? (k) => {
                setRejectingId(k.id);
                setRejectReason("");
                setRejectDetails("");
              } : undefined}
              onHold={tab === "pending" ? (k) => {
                setHoldingId(k.id);
                setHoldReason("");
              } : undefined}
              rejectingId={rejectingId}
              rejectReason={rejectReason}
              rejectDetails={rejectDetails}
              setRejectReason={setRejectReason}
              setRejectDetails={setRejectDetails}
              onConfirmReject={(k) => {
                rejectClip(k.id, rejectReason || "Rejected by admin", rejectDetails || undefined, actor);
                setRejectingId(null);
                setRejectReason("");
                setRejectDetails("");
              }}
              onCancelReject={() => {
                setRejectingId(null);
                setRejectReason("");
                setRejectDetails("");
              }}
              holdingId={holdingId}
              holdReason={holdReason}
              setHoldReason={setHoldReason}
              onConfirmHold={(k) => {
                holdClip(k.id, holdReason || "Held by admin", actor);
                setHoldingId(null);
                setHoldReason("");
              }}
              onCancelHold={() => {
                setHoldingId(null);
                setHoldReason("");
              }}
              auditId={auditId}
              onToggleAudit={(id) => setAuditId(auditId === id ? null : id)}
              tab={tab}
            />
          ) : (
            <ApprovedClipsTable
              financeRecords={list.map((k) => financeRecords.find((r) => r.clipId === k.id)).filter(Boolean) as FinanceRecord[]}
              clips={list}
              campaigns={campaigns}
              auditId={auditId}
              onToggleAudit={(id) => setAuditId(auditId === id ? null : id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   AUDIT TRAIL
   ================================================================ */

function AuditTrail({ clip }: { clip: Clip }) {
  if (!clip.audit || clip.audit.length === 0)
    return <p className="text-[13px] text-muted">No audit entries.</p>;
  return (
    <ol className="space-y-3">
      {clip.audit.map((e, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
          <div className="min-w-0">
            <p className="text-[14px] font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
            <p className="text-[13px] text-muted">
              {e.by ? `${e.by} · ` : ""}
              {fmtDateTime(e.at)}
            </p>
            {e.note && <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ================================================================
   REVIEW TABLE (Pending / Held / Rejected)
   ================================================================ */

function ReviewTable({
  clips,
  campaigns,
  onApprove,
  onReject,
  onHold,
  rejectingId,
  rejectReason,
  rejectDetails,
  setRejectReason,
  setRejectDetails,
  onConfirmReject,
  onCancelReject,
  holdingId,
  holdReason,
  setHoldReason,
  onConfirmHold,
  onCancelHold,
  auditId,
  onToggleAudit,
  tab,
}: {
  clips: Clip[];
  campaigns: Campaign[];
  onApprove?: (k: Clip) => void;
  onReject?: (k: Clip) => void;
  onHold?: (k: Clip) => void;
  rejectingId: string | null;
  rejectReason: string;
  rejectDetails: string;
  setRejectReason: (v: string) => void;
  setRejectDetails: (v: string) => void;
  onConfirmReject: (k: Clip) => void;
  onCancelReject: () => void;
  holdingId: string | null;
  holdReason: string;
  setHoldReason: (v: string) => void;
  onConfirmHold: (k: Clip) => void;
  onCancelHold: () => void;
  auditId: string | null;
  onToggleAudit: (id: string) => void;
  tab: string;
}) {
  const emptyMessages: Record<string, { heading: string; sub: string }> = {
    pending: { heading: "No clips awaiting review", sub: "New submissions will appear here." },
    held: { heading: "No held clips", sub: "Clips on hold will appear here." },
    rejected: { heading: "No rejected clips", sub: "Rejected clips will appear here." },
  };
  const empty = emptyMessages[tab] ?? { heading: "No clips", sub: "" };

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 p-4 sm:hidden">
        {clips.map((k) => {
          const c = campaigns.find((x) => x.id === k.campaignId);
          return (
            <div key={k.id} className="rounded-[10px] border border-border/40 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{k.caption}</p>
                  <p className="mt-0.5 text-[13px] text-muted">@{k.clipper} · {c?.title ?? "Campaign"}</p>
                </div>
                <StatusPill status={k.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-muted">
                <span>{fmtDate(k.submittedAt)}</span>
                <span className="font-mono">{fmtViews(k.verifiedViews ?? 0)} views</span>
                {k.platform && <PlatformIcon p={k.platform} size={13} />}
                {k.videoUrl && (
                  <a href={k.videoUrl} target="_blank" rel="noreferrer" className="text-foreground/60 hover:underline">
                    View ↗
                  </a>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {onApprove && (
                  <button onClick={() => onApprove(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] bg-green/10 px-3 text-[13px] font-medium text-green transition-colors hover:bg-green/20">
                    <Check size={14} /> Approve
                  </button>
                )}
                {onReject && (
                  <button onClick={() => onReject(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] bg-red/10 px-3 text-[13px] font-medium text-red transition-colors hover:bg-red/20">
                    <Ban size={14} /> Reject
                  </button>
                )}
                {onHold && (
                  <button onClick={() => onHold(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft">
                    <ShieldAlert size={14} /> Hold
                  </button>
                )}
                <button onClick={() => onToggleAudit(k.id)} className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft ${auditId === k.id ? "bg-accent-soft" : ""}`}>
                  <History size={14} /> Audit{k.audit?.length ? ` (${k.audit.length})` : ""}
                </button>
              </div>
              {auditId === k.id && (
                <div className="mt-3 rounded-[8px] border border-border/40 bg-card px-4 py-3">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Audit trail</p>
                  <AuditTrail clip={k} />
                </div>
              )}
            </div>
          );
        })}
        {rejectingId && (
          <div className="space-y-3 rounded-[10px] border border-red/20 bg-red/5 p-4">
            <p className="text-[14px] font-medium text-red">Reason</p>
            <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (e.g. Campaign rule violation)" className="w-full rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30" />
            <textarea value={rejectDetails} onChange={(e) => setRejectDetails(e.target.value)} rows={2} placeholder="Details (optional)" className="w-full resize-none rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30" />
            <div className="flex gap-2">
              <button onClick={() => { const k = clips.find((x) => x.id === rejectingId); if (k) onConfirmReject(k); }} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] bg-red px-4 text-[14px] font-medium text-white transition-colors hover:opacity-90">
                <Ban size={14} /> Confirm
              </button>
              <button onClick={onCancelReject} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[14px] font-medium transition-colors hover:bg-accent-soft">
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}
        {holdingId && (
          <div className="space-y-3 rounded-[10px] border border-amber/20 bg-amber/5 p-4">
            <p className="text-[14px] font-medium text-amber">Hold reason</p>
            <input value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="e.g. Copyright review" className="w-full rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30" />
            <div className="flex gap-2">
              <button onClick={() => { const k = clips.find((x) => x.id === holdingId); if (k) onConfirmHold(k); }} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] bg-amber px-4 text-[14px] font-medium text-white transition-colors hover:opacity-90">
                <ShieldAlert size={14} /> Confirm
              </button>
              <button onClick={onCancelHold} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[14px] font-medium transition-colors hover:bg-accent-soft">
                <X size={14} /> Cancel
              </button>
            </div>
          </div>
        )}
        {clips.length === 0 && (
          <div className="rounded-[10px] border border-border/40 bg-card p-8 text-center">
            <p className="text-[15px] font-medium">{empty.heading}</p>
            <p className="mt-1 text-[13px] text-muted">{empty.sub}</p>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <table className="hidden w-full min-w-[900px] text-[14px] sm:table">
        <thead>
          <tr className="border-b border-border/40 text-left text-[13px] text-muted">
            <th className="px-5 py-3 font-medium">Clip</th>
            <th className="px-5 py-3 font-medium">Clipper</th>
            <th className="px-5 py-3 font-medium">Campaign</th>
            <th className="px-5 py-3 font-medium">Platform</th>
            <th className="px-5 py-3 font-medium">Submitted</th>
            <th className="px-5 py-3 text-right font-medium">Views</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {clips.map((k) => {
            const c = campaigns.find((x) => x.id === k.campaignId);
            return (
              <FragmentRow
                key={k.id}
                colSpan={8}
                extra={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {onApprove && (
                      <button onClick={() => onApprove(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] bg-green/10 px-3 text-[13px] font-medium text-green transition-colors hover:bg-green/20">
                        <Check size={14} /> Approve
                      </button>
                    )}
                    {onReject && (
                      <button onClick={() => onReject(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] bg-red/10 px-3 text-[13px] font-medium text-red transition-colors hover:bg-red/20">
                        <Ban size={14} /> Reject
                      </button>
                    )}
                    {onHold && (
                      <button onClick={() => onHold(k)} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft">
                        <ShieldAlert size={14} /> Hold
                      </button>
                    )}
                    <button onClick={() => onToggleAudit(k.id)} className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft ${auditId === k.id ? "bg-accent-soft" : ""}`}>
                      <History size={14} /> Audit{k.audit?.length ? ` (${k.audit.length})` : ""}
                    </button>
                  </div>
                }
                audit={
                  auditId === k.id ? (
                    <div className="mt-2 rounded-[8px] border border-border/40 bg-background px-5 py-4">
                      <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">Audit trail</p>
                      <AuditTrail clip={k} />
                    </div>
                  ) : null
                }
              >
                <td className="px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{k.caption}</p>
                    {k.videoUrl && (
                      <a href={k.videoUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[13px] text-foreground/60 hover:underline">
                        View clip ↗
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 font-medium">@{k.clipper}</td>
                <td className="px-5 py-4 text-muted">{c?.title ?? "Campaign"}</td>
                <td className="px-5 py-4">{k.platform && <PlatformIcon p={k.platform} size={15} />}</td>
                <td className="px-5 py-4 text-[13px] text-muted">{fmtDate(k.submittedAt)}</td>
                <td className="px-5 py-4 text-right font-mono">{fmtViews(k.verifiedViews ?? 0)}</td>
                <td className="px-5 py-4"><StatusPill status={k.status} /></td>
              </FragmentRow>
            );
          })}
          {clips.length === 0 && (
            <tr><td colSpan={8} className="px-5 py-12 text-center">
              <p className="text-[15px] font-medium">{empty.heading}</p>
              <p className="mt-1 text-[13px] text-muted">{empty.sub}</p>
            </td></tr>
          )}
          {rejectingId && (
            <RejectFormRow colSpan={8} reason={rejectReason} details={rejectDetails} onReason={setRejectReason} onDetails={setRejectDetails} onConfirm={() => { const k = clips.find((x) => x.id === rejectingId); if (k) onConfirmReject(k); }} onCancel={onCancelReject} />
          )}
          {holdingId && (
            <RejectFormRow colSpan={8} reason={holdReason} details="" title="Hold reason" placeholder="e.g. Copyright review" onReason={setHoldReason} onDetails={() => {}} onConfirm={() => { const k = clips.find((x) => x.id === holdingId); if (k) onConfirmHold(k); }} onCancel={onCancelHold} />
          )}
        </tbody>
      </table>
    </>
  );
}

/* ================================================================
   APPROVED CLIPS TABLE
   ================================================================ */

function ApprovedClipsTable({
  financeRecords,
  clips,
  campaigns,
  auditId,
  onToggleAudit,
}: {
  financeRecords: FinanceRecord[];
  clips: Clip[];
  campaigns: Campaign[];
  auditId: string | null;
  onToggleAudit: (id: string) => void;
}) {
  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 p-4 sm:hidden">
        {financeRecords.map((r) => {
          const clip = clips.find((c) => c.id === r.clipId);
          const c = campaigns.find((x) => x.id === r.campaignId);
          const paymentLabel = r.status === "paid" ? "Paid" : r.status === "processing" ? "Processing" : "Payable";
          const paymentStyle = r.status === "paid" ? "bg-green/10 text-green" : r.status === "processing" ? "bg-amber/10 text-amber" : "bg-amber/10 text-amber";
          return (
            <div key={r.id} className="rounded-[10px] border border-border/40 bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{clip?.caption ?? "—"}</p>
                  <p className="mt-0.5 text-[13px] text-muted">@{clip?.clipper ?? "—"} · {c?.title ?? "Campaign"}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${paymentStyle}`}>{paymentLabel}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div><span className="text-muted">Views </span><span className="font-mono font-medium">{fmtViews(clip?.verifiedViews ?? 0)}</span></div>
                <div><span className="text-muted">Gross </span><span className="font-mono font-medium">{rup(r.grossAmount / 100)}</span></div>
                <div><span className="text-muted">Fee </span><span className="font-mono text-muted">{rup(r.platformFee / 100)}</span></div>
                <div><span className="text-muted">Net </span><span className="font-mono font-semibold text-green">{rup(r.netAmount / 100)}</span></div>
              </div>
              {clip?.videoUrl && (
                <a href={clip.videoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] text-foreground/60 hover:underline">View clip ↗</a>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => onToggleAudit(r.id)} className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft ${auditId === r.id ? "bg-accent-soft" : ""}`}>
                  <History size={14} /> Audit
                </button>
                {r.paidAt && <span className="text-[12px] text-muted">Paid {fmtDate(r.paidAt)}</span>}
              </div>
              {auditId === r.id && (
                <div className="mt-3 rounded-[8px] border border-border/40 bg-card px-4 py-3">
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Audit trail</p>
                  {r.audit && r.audit.length > 0 ? (
                    <ol className="space-y-3">
                      {r.audit.map((e, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
                            <p className="text-[13px] text-muted">{e.by ? `${e.by} · ` : ""}{fmtDateTime(e.at)}</p>
                            {e.note && <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-[13px] text-muted">No audit entries.</p>}
                </div>
              )}
            </div>
          );
        })}
        {financeRecords.length === 0 && (
          <div className="rounded-[10px] border border-border/40 bg-card p-8 text-center">
            <p className="text-[15px] font-medium">No approved clips</p>
            <p className="mt-1 text-[13px] text-muted">Approved clips will move through the payout workflow here.</p>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <table className="hidden w-full min-w-[1000px] text-[14px] sm:table">
      <thead>
        <tr className="border-b border-border/40 text-left text-[13px] text-muted">
          <th className="px-5 py-3 font-medium">Clip</th>
          <th className="px-5 py-3 font-medium">Clipper</th>
          <th className="px-5 py-3 font-medium">Campaign</th>
          <th className="px-5 py-3 text-right font-medium">Views</th>
          <th className="px-5 py-3 text-right font-medium">CPM</th>
          <th className="px-5 py-3 text-right font-medium">Gross</th>
          <th className="px-5 py-3 text-right font-medium">Platform fee</th>
          <th className="px-5 py-3 text-right font-medium">Net clipper</th>
          <th className="px-5 py-3 font-medium">Payment</th>
          <th className="px-5 py-3 font-medium">Paid</th>
          <th className="px-5 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {financeRecords.map((r) => {
          const clip = clips.find((c) => c.id === r.clipId);
          const c = campaigns.find((x) => x.id === r.campaignId);
          const cpm = clip ? clipCPM(clip, campaigns) : 0;

          const paymentLabel =
            r.status === "paid" ? "Paid" :
            r.status === "processing" ? "Processing" :
            "Payable";
          const paymentStyle =
            r.status === "paid" ? "bg-green/10 text-green" :
            r.status === "processing" ? "bg-amber/10 text-amber" :
            "bg-amber/10 text-amber";

          return (
            <FragmentRow
              key={r.id}
              colSpan={11}
              extra={
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => onToggleAudit(r.id)}
                    className={`inline-flex h-9 cursor-pointer items-center gap-1 rounded-[8px] border border-border/60 px-3 text-[13px] font-medium transition-colors hover:bg-accent-soft ${
                      auditId === r.id ? "bg-accent-soft" : ""
                    }`}
                  >
                    <History size={14} /> Audit
                  </button>
                </div>
              }
              audit={
                auditId === r.id ? (
                  <div className="mt-2 rounded-[8px] border border-border/40 bg-background px-5 py-4">
                    <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
                      Audit trail
                    </p>
                    {r.audit && r.audit.length > 0 ? (
                      <ol className="space-y-3">
                        {r.audit.map((e, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                            <div className="min-w-0">
                              <p className="text-[14px] font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
                              <p className="text-[13px] text-muted">
                                {e.by ? `${e.by} · ` : ""}
                                {fmtDateTime(e.at)}
                              </p>
                              {e.note && <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[13px] text-muted">No audit entries.</p>
                    )}
                  </div>
                ) : null
              }
            >
              <td className="px-5 py-4 max-w-[180px]">
                <p className="truncate font-medium">{clip?.caption ?? "—"}</p>
                {clip?.videoUrl && (
                  <a
                    href={clip.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-foreground/60 hover:underline"
                  >
                    View ↗
                  </a>
                )}
                {clip?.status === "held" && clip.heldReason && (
                  <p className="mt-0.5 text-[13px] text-muted">Held: {clip.heldReason}</p>
                )}
              </td>
              <td className="px-5 py-4 font-medium">@{clip?.clipper ?? "—"}</td>
              <td className="px-5 py-4 text-muted">{c?.title ?? "Campaign"}</td>
              <td className="px-5 py-4 text-right font-mono">{fmtViews(clip?.verifiedViews ?? 0)}</td>
              <td className="px-5 py-4 text-right font-mono">{rup(cpm)}</td>
              <td className="px-5 py-4 text-right font-mono">{rup(r.grossAmount / 100)}</td>
              <td className="px-5 py-4 text-right font-mono text-muted">
                {rup(r.platformFee / 100)}
              </td>
              <td className="px-5 py-4 text-right font-mono font-semibold text-green">
                {rup(r.netAmount / 100)}
              </td>
              <td className="px-5 py-4">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${paymentStyle}`}>
                  {paymentLabel}
                </span>
              </td>
              <td className="px-5 py-4 text-[13px] text-muted">{r.paidAt ? fmtDate(r.paidAt) : "—"}</td>
            </FragmentRow>
          );
        })}
        {financeRecords.length === 0 && (
          <tr>
            <td colSpan={11} className="px-5 py-12 text-center">
              <p className="text-[15px] font-medium">No approved clips</p>
              <p className="mt-1 text-[13px] text-muted">
                Approved clips will move through the payout workflow here.
              </p>
            </td>
          </tr>
        )}
      </tbody>
    </table>
    </>
  );
}

/* ================================================================
   FRAGMENT ROW (expands with audit trail)
   ================================================================ */

function FragmentRow({
  colSpan,
  children,
  extra,
  audit,
}: {
  colSpan: number;
  children: ReactNode;
  extra: ReactNode;
  audit: ReactNode;
}) {
  return (
    <>
      <tr className="align-top transition-colors hover:bg-accent-soft/50">
        {children}
        <td className="px-5 py-4">
          <div className="flex flex-col items-end gap-2">{extra}</div>
        </td>
      </tr>
      {audit ? (
        <tr>
          <td colSpan={colSpan} className="px-5 pb-4 pt-0">
            {audit}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ================================================================
   REJECT / HOLD FORM ROW
   ================================================================ */

function RejectFormRow({
  colSpan,
  reason,
  details,
  title = "Reason",
  placeholder = "Reason (e.g. Campaign rule violation)",
  onReason,
  onDetails,
  onConfirm,
  onCancel,
}: {
  colSpan: number;
  reason: string;
  details: string;
  title?: string;
  placeholder?: string;
  onReason: (v: string) => void;
  onDetails: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-4">
        <div className="space-y-3 rounded-[10px] border border-red/20 bg-red/5 px-5 py-4">
          <p className="text-[14px] font-medium text-red">{title}</p>
          <input
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
          {details !== undefined && (
            <textarea
              value={details}
              onChange={(e) => onDetails(e.target.value)}
              rows={2}
              placeholder="Details (optional)"
              className="w-full resize-none rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] bg-red px-4 text-[14px] font-medium text-white transition-colors hover:opacity-90"
            >
              <Ban size={14} /> Confirm
            </button>
            <button
              onClick={onCancel}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[14px] font-medium transition-colors hover:bg-accent-soft"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
