"use client";

import { startTransition, useEffect, useState } from "react";
import {
  Search,
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
  { value: "user_deactivate", label: "User deactivated" },
  { value: "user_self_deactivate", label: "Self-service deactivation" },
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
  clip_hold: "bg-amber/10 text-amber",
  clip_held: "bg-amber/10 text-amber",
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
  user_deactivate: "bg-amber/10 text-amber",
  user_self_deactivate: "bg-amber/10 text-amber",
  campaign_pause: "bg-amber/10 text-amber",
  campaign_paused: "bg-amber/10 text-amber",
  campaign_resume: "bg-green/10 text-green",
  campaign_close: "bg-red/10 text-red",
  campaign_closed: "bg-red/10 text-red",
  campaign_reopen: "bg-green/10 text-green",
  campaign_archive: "bg-amber/10 text-amber",
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
    <div className="mx-auto max-w-[1120px] space-y-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
            Audit Log
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Review administrative actions and important platform events.{" "}
            {logs.length} event{logs.length !== 1 ? "s" : ""}
            {activeFilters > 0 ? " (filtered)" : ""}.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={logs.length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[13px] font-medium transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search logs…"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-11 cursor-pointer rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30 sm:flex-initial"
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
            className="h-11 cursor-pointer rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30 sm:flex-initial"
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
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30 sm:w-40"
          />
        </div>
      </div>

      {/* ── Log entries ─────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        {loading ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-muted">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-[14px]">Loading audit logs…</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center text-muted">
            <p className="text-[15px] font-medium">No audit logs found.</p>
            {(q || action || entityType || actor) && (
              <button
                onClick={() => {
                  setQ("");
                  setAction("");
                  setEntityType("");
                  setActor("");
                }}
                className="cursor-pointer text-[13px] text-muted underline transition-colors hover:text-foreground"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {logs.map((log) => {
              const Icon = ENTITY_ICONS[log.entity_type] ?? Settings;
              const colorClass = ACTION_COLORS[log.action] ?? "bg-muted/10 text-muted";
              const before = log.before_state as Record<string, unknown> | null;
              const after = log.after_state as Record<string, unknown> | null;
              const meta = log.metadata as Record<string, unknown> | null;
              return (
                <div
                  key={log.id}
                  className="flex gap-4 px-5 py-4"
                >
                  <div className="mt-0.5 shrink-0">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-[8px] ${colorClass}`}
                    >
                      <Icon size={15} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[12px] font-medium ${colorClass}`}
                      >
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="text-[13px] text-muted">
                        {log.entity_type}
                        {log.entity_label ? ` · ${log.entity_label}` : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted">
                      <span>by {log.actor}</span>
                      <span>{fmtDateTime(log.timestamp)}</span>
                      {log.entity_id && (
                        <span className="font-mono text-[11px] text-muted/60">
                          {log.entity_id}
                        </span>
                      )}
                    </div>
                    {(before || after) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                        {before && (
                          <span className="rounded-[4px] bg-muted/10 px-1.5 py-0.5 font-mono text-muted">
                            {JSON.stringify(before)}
                          </span>
                        )}
                        {before && after && (
                          <span className="text-muted">→</span>
                        )}
                        {after && (
                          <span className="rounded-[4px] bg-accent-soft px-1.5 py-0.5 font-mono">
                            {JSON.stringify(after)}
                          </span>
                        )}
                      </div>
                    )}
                    {typeof meta?.reason === "string" && meta.reason.length > 0 && (
                      <p className="mt-1.5 text-[13px] text-muted">
                        <span className="font-medium">Reason:</span>{" "}
                        {String(meta.reason)}
                      </p>
                    )}
                    {log.idempotency_key && (
                      <p className="mt-1 font-mono text-[11px] text-muted/40">
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

      {/* ── Footer note ─────────────────────────────────── */}
      <p className="text-[13px] text-muted">
        Audit logs are append-only and cannot be edited or deleted. Actor is always
        derived from auth.uid() server-side.
      </p>
    </div>
  );
}
