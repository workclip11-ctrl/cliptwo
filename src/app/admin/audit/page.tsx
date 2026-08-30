"use client";

import { useMemo, useState } from "react";
import {
  Search,
  History,
  Download,
  User,
  Megaphone,
  Film,
  ShieldAlert,
  Settings,
} from "lucide-react";
import {
  searchAuditLogs,
  subscribeAuditLogs,
  initAuditLogs,
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_TYPES,
} from "@/lib/audit";
import type { AuditAction } from "@/lib/types";
import { useEffect } from "react";

const ACTION_OPTIONS: Array<{ value: AuditAction | ""; label: string }> = [
  { value: "", label: "All actions" },
  { value: "user_created", label: "User created" },
  { value: "user_suspended", label: "User suspended" },
  { value: "user_reactivated", label: "User reactivated" },
  { value: "user_verified", label: "User verified" },
  { value: "user_unverified", label: "User unverified" },
  { value: "campaign_created", label: "Campaign created" },
  { value: "campaign_edited", label: "Campaign edited" },
  { value: "campaign_paused", label: "Campaign paused" },
  { value: "campaign_ended", label: "Campaign ended" },
  { value: "campaign_closed", label: "Campaign closed" },
  { value: "clip_approved", label: "Clip approved" },
  { value: "clip_rejected", label: "Clip rejected" },
  { value: "clip_held", label: "Clip held" },
  { value: "earnings_adjusted", label: "Earnings adjusted" },
  { value: "payout_initiated", label: "Payout initiated" },
  { value: "payout_completed", label: "Payout completed" },
  { value: "payout_failed", label: "Payout failed" },
  { value: "fraud_flag_created", label: "Fraud flag created" },
  { value: "fraud_flag_cleared", label: "Fraud flag cleared" },
  { value: "account_changed", label: "Account changed" },
  { value: "permission_changed", label: "Permission changed" },
  { value: "admin_notes", label: "Admin notes" },
  { value: "appeal_response", label: "Appeal response" },
  { value: "risk_flagged", label: "Risk flagged" },
  { value: "risk_cleared", label: "Risk cleared" },
];

const TARGET_ICONS: Record<string, typeof User> = {
  user: User,
  campaign: Megaphone,
  clip: Film,
  fraud: ShieldAlert,
  system: Settings,
};

const ACTION_COLORS: Record<string, string> = {
  user_created: "bg-green/10 text-green",
  user_suspended: "bg-red/10 text-red",
  user_reactivated: "bg-green/10 text-green",
  user_verified: "bg-green/10 text-green",
  user_unverified: "bg-muted/10 text-muted",
  campaign_created: "bg-green/10 text-green",
  campaign_edited: "bg-blue-500/10 text-blue-500",
  campaign_paused: "bg-amber/10 text-amber",
  campaign_ended: "bg-muted/10 text-muted",
  campaign_closed: "bg-red/10 text-red",
  clip_approved: "bg-green/10 text-green",
  clip_rejected: "bg-red/10 text-red",
  clip_held: "bg-purple-400/10 text-purple-400",
  earnings_adjusted: "bg-amber/10 text-amber",
  payout_initiated: "bg-blue-500/10 text-blue-500",
  payout_completed: "bg-green/10 text-green",
  payout_failed: "bg-red/10 text-red",
  fraud_flag_created: "bg-red/10 text-red",
  fraud_flag_cleared: "bg-green/10 text-green",
  account_changed: "bg-blue-500/10 text-blue-500",
  permission_changed: "bg-amber/10 text-amber",
  admin_notes: "bg-muted/10 text-muted",
  appeal_response: "bg-blue-500/10 text-blue-500",
  risk_flagged: "bg-red/10 text-red",
  risk_cleared: "bg-green/10 text-green",
  other: "bg-muted/10 text-muted",
};

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminAuditPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [targetType, setTargetType] = useState("");
  const [actor, setActor] = useState("");
  const [, setTick] = useState(0);

  // Re-render when audit logs change
  useEffect(() => {
    initAuditLogs();
    const unsub = subscribeAuditLogs(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const logs = useMemo(
    () =>
      searchAuditLogs({
        q,
        action: action || undefined,
        targetType: targetType || undefined,
        actor: actor || undefined,
      }),
    [q, action, targetType, actor],
  );

  const exportCsv = () => {
    const header = "Timestamp,Actor,Action,Target Type,Target ID,Target Label,Previous Value,New Value,Reason\n";
    const rows = logs
      .map(
        (l) =>
          `"${fmtDateTime(l.timestamp)}","${l.actor}","${AUDIT_ACTION_LABELS[l.action] ?? l.action}","${l.targetType}","${l.targetId}","${l.targetLabel ?? ""}","${l.previousValue ?? ""}","${l.newValue ?? ""}","${l.reason ?? ""}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${fmtDate(Date.now()).replace(/ /g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeFilters = [action, targetType, actor, q].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <History size={22} />
            Audit Log
          </h1>
          <p className="mt-1 text-sm text-muted">
            Append-only record of all admin actions. {logs.length} events
            {activeFilters > 0 ? " (filtered)" : ""}.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={logs.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-40"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search logs..."
            className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as AuditAction | "")}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:flex-initial"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:flex-initial"
          >
            <option value="">All targets</option>
            {AUDIT_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>

          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filter by actor"
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:w-40"
          />
        </div>
      </div>

      {/* Log entries */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted">
            <History size={28} />
            <p className="text-sm">No audit logs found.</p>
            {(q || action || targetType || actor) && (
              <button
                onClick={() => {
                  setQ("");
                  setAction("");
                  setTargetType("");
                  setActor("");
                }}
                className="text-xs text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => {
              const Icon = TARGET_ICONS[log.targetType] ?? Settings;
              const colorClass = ACTION_COLORS[log.action] ?? "bg-muted/10 text-muted";
              return (
                <div
                  key={log.id}
                  className="flex gap-3 px-4 py-3 sm:gap-4"
                >
                  <div className="mt-0.5 shrink-0">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}
                    >
                      <Icon size={15} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
                      >
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="text-xs text-muted">
                        {log.targetType}
                        {log.targetLabel ? ` · ${log.targetLabel}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span>by {log.actor}</span>
                      <span>{fmtDateTime(log.timestamp)}</span>
                      {log.targetId && (
                        <span className="font-mono text-[10px] text-muted/70">
                          {log.targetId}
                        </span>
                      )}
                    </div>
                    {(log.previousValue || log.newValue) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {log.previousValue && (
                          <span className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-muted">
                            {log.previousValue}
                          </span>
                        )}
                        {log.previousValue && log.newValue && (
                          <span className="text-muted">→</span>
                        )}
                        {log.newValue && (
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono">
                            {log.newValue}
                          </span>
                        )}
                      </div>
                    )}
                    {log.reason && (
                      <p className="mt-1 text-xs text-muted">
                        <span className="font-medium">Reason:</span> {log.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Audit logs are append-only and cannot be edited or deleted from the UI.
      </p>
    </div>
  );
}
