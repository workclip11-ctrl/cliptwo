"use client";

import { startTransition, useEffect, useState } from "react";
import {
  Search,
  History,
  Download,
  User,
  Megaphone,
  Film,
  ShieldAlert,
  Settings,
  Loader2,
} from "lucide-react";
import {
  fetchAuditLogs,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_TYPES,
  type AuditLogEntry,
} from "@/lib/audit";

const ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All actions" },
  { value: "clip_approve", label: "Clip approved" },
  { value: "clip_reject", label: "Clip rejected" },
  { value: "clip_hold", label: "Clip held" },
  { value: "clip_processing", label: "Payout processing" },
  { value: "clip_paid", label: "Clip paid" },
  { value: "clip_failed", label: "Payout failed" },
  { value: "clip_retry", label: "Payout retried" },
  { value: "clip_release", label: "Clip released" },
  { value: "clip_revert", label: "Clip reverted" },
  { value: "user_suspend", label: "User suspended" },
  { value: "user_reactivate", label: "User reactivated" },
  { value: "user_verify", label: "User verified" },
  { value: "user_unverify", label: "User unverified" },
  { value: "user_set_risk", label: "Risk flagged" },
  { value: "user_clear_risk", label: "Risk cleared" },
  { value: "user_save_notes", label: "Admin notes" },
  { value: "user_delete", label: "User deleted" },
  { value: "campaign_pause", label: "Campaign paused" },
  { value: "campaign_resume", label: "Campaign resumed" },
  { value: "campaign_close", label: "Campaign closed" },
  { value: "campaign_reopen", label: "Campaign reopened" },
  { value: "campaign_archive", label: "Campaign archived" },
  { value: "campaign_created", label: "Campaign created" },
  { value: "campaign_edited", label: "Campaign edited" },
];

const ENTITY_ICONS: Record<string, typeof User> = {
  user: User,
  campaign: Megaphone,
  clip: Film,
  fraud: ShieldAlert,
  system: Settings,
  payout: ShieldAlert,
  earning: ShieldAlert,
};

const ACTION_COLORS: Record<string, string> = {
  clip_approve: "bg-green/10 text-green",
  clip_approved: "bg-green/10 text-green",
  clip_reject: "bg-red/10 text-red",
  clip_rejected: "bg-red/10 text-red",
  clip_hold: "bg-purple-400/10 text-purple-400",
  clip_held: "bg-purple-400/10 text-purple-400",
  clip_processing: "bg-blue-500/10 text-blue-500",
  clip_paid: "bg-green/10 text-green",
  clip_failed: "bg-red/10 text-red",
  clip_retry: "bg-blue-500/10 text-blue-500",
  clip_release: "bg-green/10 text-green",
  clip_revert: "bg-amber/10 text-amber",
  user_suspend: "bg-red/10 text-red",
  user_suspended: "bg-red/10 text-red",
  user_reactivate: "bg-green/10 text-green",
  user_reactivated: "bg-green/10 text-green",
  user_verify: "bg-green/10 text-green",
  user_verified: "bg-green/10 text-green",
  user_unverify: "bg-muted/10 text-muted",
  user_unverified: "bg-muted/10 text-muted",
  user_set_risk: "bg-red/10 text-red",
  user_clear_risk: "bg-green/10 text-green",
  user_save_notes: "bg-muted/10 text-muted",
  user_delete: "bg-red/10 text-red",
  campaign_pause: "bg-amber/10 text-amber",
  campaign_paused: "bg-amber/10 text-amber",
  campaign_resume: "bg-green/10 text-green",
  campaign_close: "bg-red/10 text-red",
  campaign_closed: "bg-red/10 text-red",
  campaign_reopen: "bg-green/10 text-green",
  campaign_archive: "bg-amber-500/10 text-amber-600",
  campaign_created: "bg-green/10 text-green",
  campaign_edited: "bg-blue-500/10 text-blue-500",
};

function fmtDateTime(ts: string): string {
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
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");

  // Fetch audit logs from database whenever filters change
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startTransition(() => { setLoading(true); });
    fetchAuditLogs({
      q: q || undefined,
      action: action || undefined,
      entity_type: entityType || undefined,
      actor: actor || undefined,
      limit: 200,
    }).then((data) => {
      if (!cancelled) {
        startTransition(() => { setLogs(data); setLoading(false); });
      }
    });
    return () => { cancelled = true; };
  }, [q, action, entityType, actor]);

  const exportCsv = () => {
    const header = "Timestamp,Actor,Action,Entity Type,Entity ID,Entity Label,Before State,After State,Metadata,Idempotency Key\n";
    const rows = logs
      .map(
        (l) =>
          `"${fmtDateTime(l.timestamp)}","${l.actor}","${AUDIT_ACTION_LABELS[l.action] ?? l.action}","${l.entity_type}","${l.entity_id}","${l.entity_label ?? ""}","${JSON.stringify(l.before_state ?? {})}","${JSON.stringify(l.after_state ?? {})}","${JSON.stringify(l.metadata ?? {})}","${l.idempotency_key ?? ""}"`,
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

  const activeFilters = [action, entityType, actor, q].filter(Boolean).length;

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
            onChange={(e) => setAction(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:flex-initial"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:flex-initial"
          >
            <option value="">All entities</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
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
        {loading ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted">
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-muted">
            <History size={28} />
            <p className="text-sm">No audit logs found.</p>
            {(q || action || entityType || actor) && (
              <button
                onClick={() => {
                  setQ("");
                  setAction("");
                  setEntityType("");
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
              const Icon = ENTITY_ICONS[log.entity_type] ?? Settings;
              const colorClass = ACTION_COLORS[log.action] ?? "bg-muted/10 text-muted";
              const before = log.before_state as Record<string, unknown> | null;
              const after = log.after_state as Record<string, unknown> | null;
              const meta = log.metadata as Record<string, unknown> | null;
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
                        {log.entity_type}
                        {log.entity_label ? ` · ${log.entity_label}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                      <span>by {log.actor}</span>
                      <span>{fmtDateTime(log.timestamp)}</span>
                      {log.entity_id && (
                        <span className="font-mono text-[10px] text-muted/70">
                          {log.entity_id}
                        </span>
                      )}
                    </div>
                    {(before || after) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {before && (
                          <span className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-muted">
                            {JSON.stringify(before)}
                          </span>
                        )}
                        {before && after && (
                          <span className="text-muted">→</span>
                        )}
                        {after && (
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono">
                            {JSON.stringify(after)}
                          </span>
                        )}
                      </div>
                    )}
                    {typeof meta?.reason === "string" && meta.reason.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        <span className="font-medium">Reason:</span> {String(meta.reason)}
                      </p>
                    )}
                    {log.idempotency_key && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted/50">
                        idempotency: {log.idempotency_key}
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
        Audit logs are append-only and cannot be edited or deleted. Actor is
        always derived from auth.uid() server-side.
      </p>
    </div>
  );
}
