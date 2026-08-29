"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Ban,
  Wallet,
  Clock,
  Banknote,
  RefreshCw,
  AlertTriangle,
  PlayCircle,
  History,
  Search,
  X,
  ShieldAlert,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, isEarned, payoutSplit, PLATFORM_FEE_RATE } from "@/lib/finance";
import { clipCPM } from "@/lib/analytics";
import type { Campaign, Clip, ClipStatus } from "@/lib/types";

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
  { key: "review", label: "Pending Review", statuses: ["pending"] },
  { key: "payable", label: "Payable", statuses: ["approved", "payable"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "failed", label: "Failed / Held", statuses: ["failed", "held"] },
];

function txnIdOf(k: Clip) {
  return k.txnId ?? `TXN-${k.id.toUpperCase()}`;
}

function updatedAtOf(k: Clip) {
  return k.updatedAt ?? (k.audit?.length ? k.audit[k.audit.length - 1].at : k.submittedAt);
}

export default function AdminClips() {
  const { clips, campaigns, setClipStatus } = useStore();
  const { user } = useAuth();
  const actor = user?.email ?? user?.name ?? "Admin";

  const [tab, setTab] = useState("review");
  const [q, setQ] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectDetails, setRejectDetails] = useState("");
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [failingId, setFailingId] = useState<string | null>(null);
  const [failReason, setFailReason] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);

  const fin = financeOf(clips, campaigns);
  const processingFin = financeOf(clips, campaigns, (k) => k.status === "processing");

  const tabStatuses = TABS.find((t) => t.key === tab)!.statuses;

  const list = useMemo(() => {
    const matched = clips.filter(
      (k) =>
        tabStatuses.includes(k.status) &&
        (!q ||
          k.clipper.toLowerCase().includes(q.toLowerCase()) ||
          (k.caption ?? "").toLowerCase().includes(q.toLowerCase()) ||
          txnIdOf(k).toLowerCase().includes(q.toLowerCase()) ||
          (campaigns.find((c) => c.id === k.campaignId)?.title ?? "")
            .toLowerCase()
            .includes(q.toLowerCase())),
    );
    return [...matched].sort((a, b) => b.submittedAt - a.submittedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, campaigns, tab, q]);

  const approve = (k: Clip) => {
    const c = campaigns.find((x) => x.id === k.campaignId);
    if (c?.budget != null) {
      const campEarned = clips
        .filter((x) => x.campaignId === c.id && isEarned(x.status))
        .reduce((s, x) => s + clipEarnings(x, campaigns), 0);
      if (campEarned + clipEarnings(k, campaigns) > c.budget) {
        alert(
          `Cannot approve: this would exceed the campaign budget (${rup(
            c.budget,
          )}). Raise the budget or reject the clip.`,
        );
        return;
      }
    }
    setClipStatus(k.id, "approved", undefined, actor);
  };

  const tabsWithCounts = TABS.map((t) => ({
    ...t,
    count: clips.filter((k) => t.statuses.includes(k.status)).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review &amp; payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Approve submitted clips, then move them through payable → processing → paid. Every
          action is written to the clip&apos;s audit trail. Nothing is marked paid until the
          payout provider confirms.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard
          icon={<Banknote size={18} className="text-amber" />}
          amount={rup(fin.outstanding)}
          label="Outstanding payable"
        />
        <SummaryCard
          icon={<PlayCircle size={18} className="text-amber" />}
          amount={rup(processingFin.outstanding)}
          label="In processing"
        />
        <SummaryCard
          icon={<Wallet size={18} className="text-blue-500" />}
          amount={rup(fin.paid)}
          label="Released to clippers"
        />
        <SummaryCard
          icon={<AlertTriangle size={18} className="text-purple-400" />}
          amount={rup(fin.held)}
          label="Held / disputed"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabsWithCounts.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-foreground bg-accent-soft text-foreground"
                  : "text-muted hover:bg-accent-soft/60"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === t.key ? "bg-background" : "bg-accent-soft"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clipper, campaign, txn…"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          {tab === "review" ? (
            <ReviewTable
              clips={list}
              campaigns={campaigns}
              onApprove={approve}
              onReject={(k) => {
                setRejectingId(k.id);
                setRejectReason("");
                setRejectDetails("");
              }}
              onHold={(k) => {
                setHoldingId(k.id);
                setHoldReason("");
              }}
              rejectingId={rejectingId}
              rejectReason={rejectReason}
              rejectDetails={rejectDetails}
              setRejectReason={setRejectReason}
              setRejectDetails={setRejectDetails}
              onConfirmReject={(k) => {
                setClipStatus(k.id, "rejected", {
                  rejectionReason: rejectReason || "Rejected by admin",
                  rejectionDetails: rejectDetails || undefined,
                });
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
                setClipStatus(k.id, "held", { heldReason: holdReason || "Held by admin" });
                setHoldingId(null);
                setHoldReason("");
              }}
              onCancelHold={() => {
                setHoldingId(null);
                setHoldReason("");
              }}
              auditId={auditId}
              onToggleAudit={(id) => setAuditId(auditId === id ? null : id)}
            />
          ) : (
            <TransactionTable
              clips={list}
              campaigns={campaigns}
              onStartPayout={(k) => setClipStatus(k.id, "processing", undefined, actor)}
              onConfirmPayout={(k) => setClipStatus(k.id, "paid", undefined, actor)}
              onFail={(k) => {
                setFailingId(k.id);
                setFailReason("");
              }}
              failingId={failingId}
              failReason={failReason}
              setFailReason={setFailReason}
              onConfirmFail={(k) => {
                setClipStatus(k.id, "failed", {
                  failureReason: failReason || "Payout failed",
                });
                setFailingId(null);
                setFailReason("");
              }}
              onCancelFail={() => {
                setFailingId(null);
                setFailReason("");
              }}
              onRetry={(k) => setClipStatus(k.id, "processing", undefined, actor)}
              onRelease={(k) => setClipStatus(k.id, "approved", undefined, actor)}
              onRevert={(k) => setClipStatus(k.id, "payable", undefined, actor)}
              auditId={auditId}
              onToggleAudit={(id) => setAuditId(auditId === id ? null : id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  amount,
  label,
}: {
  icon: ReactNode;
  amount: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      {icon}
      <div>
        <p className="font-mono text-lg font-semibold">{amount}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function AuditTrail({ clip }: { clip: Clip }) {
  if (!clip.audit || clip.audit.length === 0)
    return <p className="text-xs text-muted">No audit entries.</p>;
  return (
    <ol className="space-y-2">
      {clip.audit.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <p className="font-medium capitalize">{e.action.replace(/_/g, " ")}</p>
            <p className="text-muted">
              {e.by ? `${e.by} · ` : ""}
              {fmtDateTime(e.at)}
            </p>
            {e.note && <p className="mt-0.5 text-muted">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

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
}: {
  clips: Clip[];
  campaigns: Campaign[];
  onApprove: (k: Clip) => void;
  onReject: (k: Clip) => void;
  onHold: (k: Clip) => void;
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
}) {
  return (
    <table className="w-full min-w-[900px] text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted">
          <th className="px-4 py-3 font-medium">Clip</th>
          <th className="px-4 py-3 font-medium">Clipper</th>
          <th className="px-4 py-3 font-medium">Campaign</th>
          <th className="px-4 py-3 font-medium">Platform</th>
          <th className="px-4 py-3 font-medium">Submitted</th>
          <th className="px-4 py-3 text-right font-medium">Views</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {clips.map((k) => {
          const c = campaigns.find((x) => x.id === k.campaignId);
          return (
            <FragmentRow
              key={k.id}
              colSpan={8}
              extra={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onApprove(k)}
                    className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-xs font-medium text-green"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    onClick={() => onReject(k)}
                    className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                  >
                    <Ban size={13} /> Reject
                  </button>
                  <button
                    onClick={() => onHold(k)}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                  >
                    <ShieldAlert size={13} /> Hold
                  </button>
                  <button
                    onClick={() => onToggleAudit(k.id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft ${
                      auditId === k.id ? "bg-accent-soft" : ""
                    }`}
                  >
                    <History size={13} /> Audit
                    {k.audit?.length ? ` (${k.audit.length})` : ""}
                  </button>
                </div>
              }
              audit={
                auditId === k.id ? (
                  <div className="mt-3 rounded-lg border bg-background/50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Audit trail
                    </p>
                    <AuditTrail clip={k} />
                  </div>
                ) : null
              }
            >
              <td className="px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{k.caption}</p>
                  {k.videoUrl && (
                    <a
                      href={k.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-xs text-accent hover:underline"
                    >
                      View clip ↗
                    </a>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">@{k.clipper}</td>
              <td className="px-4 py-3 text-muted">{c?.title ?? "Campaign"}</td>
              <td className="px-4 py-3">
                {k.platform && <PlatformIcon p={k.platform} size={15} />}
              </td>
              <td className="px-4 py-3 text-muted">{fmtDate(k.submittedAt)}</td>
              <td className="px-4 py-3 text-right font-mono">{fmtViews(k.views)}</td>
              <td className="px-4 py-3">
                <StatusPill status={k.status} />
              </td>
            </FragmentRow>
          );
        })}
        {clips.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
              No clips in this view.
            </td>
          </tr>
        )}
        {rejectingId && (
          <RejectFormRow
            colSpan={8}
            reason={rejectReason}
            details={rejectDetails}
            onReason={setRejectReason}
            onDetails={setRejectDetails}
            onConfirm={() => {
              const k = clips.find((x) => x.id === rejectingId);
              if (k) onConfirmReject(k);
            }}
            onCancel={onCancelReject}
          />
        )}
        {holdingId && (
          <RejectFormRow
            colSpan={8}
            reason={holdReason}
            details=""
            title="Hold reason"
            placeholder="e.g. Copyright review"
            onReason={setHoldReason}
            onDetails={() => {}}
            onConfirm={() => {
              const k = clips.find((x) => x.id === holdingId);
              if (k) onConfirmHold(k);
            }}
            onCancel={onCancelHold}
          />
        )}
      </tbody>
    </table>
  );
}

function TransactionTable({
  clips,
  campaigns,
  onStartPayout,
  onConfirmPayout,
  onFail,
  failingId,
  failReason,
  setFailReason,
  onConfirmFail,
  onCancelFail,
  onRetry,
  onRelease,
  onRevert,
  auditId,
  onToggleAudit,
}: {
  clips: Clip[];
  campaigns: Campaign[];
  onStartPayout: (k: Clip) => void;
  onConfirmPayout: (k: Clip) => void;
  onFail: (k: Clip) => void;
  failingId: string | null;
  failReason: string;
  setFailReason: (v: string) => void;
  onConfirmFail: (k: Clip) => void;
  onCancelFail: () => void;
  onRetry: (k: Clip) => void;
  onRelease: (k: Clip) => void;
  onRevert: (k: Clip) => void;
  auditId: string | null;
  onToggleAudit: (id: string) => void;
}) {
  return (
    <table className="w-full min-w-[1200px] text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted">
          <th className="px-4 py-3 font-medium">Txn ID</th>
          <th className="px-4 py-3 font-medium">Clipper</th>
          <th className="px-4 py-3 font-medium">Campaign</th>
          <th className="px-4 py-3 font-medium">Clip</th>
          <th className="px-4 py-3 text-right font-medium">Views</th>
          <th className="px-4 py-3 text-right font-medium">CPM</th>
          <th className="px-4 py-3 text-right font-medium">Gross</th>
          <th className="px-4 py-3 text-right font-medium">Platform fee</th>
          <th className="px-4 py-3 text-right font-medium">Net clipper</th>
          <th className="px-4 py-3 font-medium">Status</th>
          <th className="px-4 py-3 font-medium">Created</th>
          <th className="px-4 py-3 font-medium">Updated</th>
          <th className="px-4 py-3 font-medium">Payout</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {clips.map((k) => {
          const c = campaigns.find((x) => x.id === k.campaignId);
          const split = payoutSplit(k, campaigns);
          const cpm = clipCPM(k, campaigns);
          return (
            <FragmentRow
              key={k.id}
              colSpan={14}
              extra={
                <div className="flex flex-wrap items-center gap-2">
                  {k.status === "approved" || k.status === "payable" ? (
                    <button
                      onClick={() => onStartPayout(k)}
                      className="inline-flex items-center gap-1 rounded-md bg-amber/10 px-2.5 py-1 text-xs font-medium text-amber"
                    >
                      <PlayCircle size={13} /> Start payout
                    </button>
                  ) : null}
                  {k.status === "processing" ? (
                    <>
                      <button
                        onClick={() => onConfirmPayout(k)}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500"
                        title="Mark paid only after the provider confirms"
                      >
                        <Wallet size={13} /> Confirm payout
                      </button>
                      <button
                        onClick={() => onFail(k)}
                        className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                      >
                        <Ban size={13} /> Fail
                      </button>
                    </>
                  ) : null}
                  {k.status === "paid" ? (
                    <button
                      onClick={() => onRevert(k)}
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                      title="Revert to payable (not yet released)"
                    >
                      <Clock size={13} /> Revert
                    </button>
                  ) : null}
                  {k.status === "failed" ? (
                    <button
                      onClick={() => onRetry(k)}
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    >
                      <RefreshCw size={13} /> Retry
                    </button>
                  ) : null}
                  {k.status === "held" ? (
                    <button
                      onClick={() => onRelease(k)}
                      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                    >
                      <RefreshCw size={13} /> Release
                    </button>
                  ) : null}
                  <button
                    onClick={() => onToggleAudit(k.id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft ${
                      auditId === k.id ? "bg-accent-soft" : ""
                    }`}
                  >
                    <History size={13} /> Audit
                    {k.audit?.length ? ` (${k.audit.length})` : ""}
                  </button>
                </div>
              }
              audit={
                auditId === k.id ? (
                  <div className="mt-3 rounded-lg border bg-background/50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Audit trail
                    </p>
                    <AuditTrail clip={k} />
                  </div>
                ) : null
              }
            >
              <td className="px-4 py-3 font-mono text-xs">{txnIdOf(k)}</td>
              <td className="px-4 py-3">@{k.clipper}</td>
              <td className="px-4 py-3 text-muted">{c?.title ?? "Campaign"}</td>
              <td className="px-4 py-3 max-w-[180px]">
                <p className="truncate font-medium">{k.caption}</p>
                {k.videoUrl && (
                  <a
                    href={k.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    View ↗
                  </a>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono">{fmtViews(k.views)}</td>
              <td className="px-4 py-3 text-right font-mono">{rup(cpm)}</td>
              <td className="px-4 py-3 text-right font-mono">{rup(split.gross)}</td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                {rup(split.fee)}
                <span className="ml-1 text-[10px]">
                  {Math.round(PLATFORM_FEE_RATE * 100)}%
                </span>
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold text-green">
                {rup(split.net)}
              </td>
              <td className="px-4 py-3">
                <StatusPill status={k.status} />
              </td>
              <td className="px-4 py-3 text-muted">{fmtDate(k.submittedAt)}</td>
              <td className="px-4 py-3 text-muted">{fmtDate(updatedAtOf(k))}</td>
              <td className="px-4 py-3 text-muted">
                {k.status === "paid" ? fmtDate(k.payoutDate) : "—"}
              </td>
            </FragmentRow>
          );
        })}
        {clips.length === 0 && (
          <tr>
            <td colSpan={14} className="px-4 py-10 text-center text-sm text-muted">
              No transactions in this view.
            </td>
          </tr>
        )}
        {failingId && (
          <RejectFormRow
            colSpan={14}
            reason={failReason}
            details=""
            title="Why did the payout fail?"
            placeholder="e.g. UPI verification failed"
            onReason={setFailReason}
            onDetails={() => {}}
            onConfirm={() => {
              const k = clips.find((x) => x.id === failingId);
              if (k) onConfirmFail(k);
            }}
            onCancel={onCancelFail}
          />
        )}
      </tbody>
    </table>
  );
}

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
      <tr className="align-top">
        {children}
        <td className="px-4 py-3">
          <div className="flex flex-col items-end gap-2">{extra}</div>
        </td>
      </tr>
      {audit ? (
        <tr>
          <td colSpan={colSpan} className="px-4 pb-4 pt-0">
            {audit}
          </td>
        </tr>
      ) : null}
    </>
  );
}

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
      <td colSpan={colSpan} className="px-4 py-3">
        <div className="space-y-2 rounded-lg border border-red/30 bg-red/5 p-3">
          <p className="text-xs font-medium text-red">{title}</p>
          <input
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
          />
          <textarea
            value={details}
            onChange={(e) => onDetails(e.target.value)}
            rows={2}
            placeholder="Details (optional)"
            className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
          />
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
            >
              <Ban size={13} /> Confirm
            </button>
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}
