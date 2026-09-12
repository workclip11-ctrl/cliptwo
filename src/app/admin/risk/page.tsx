"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { fmtViews } from "@/lib/format";
import type { RiskType, Severity, RiskStatus } from "@/lib/types";

const SEVERITY_COLORS: Record<Severity, string> = {
  low: "bg-green/10 text-green",
  medium: "bg-amber/10 text-amber",
  high: "bg-red/10 text-red",
};

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-500/10 text-blue-500",
  "Under Review": "bg-amber/10 text-amber",
  Cleared: "bg-green/10 text-green",
  Confirmed: "bg-red/10 text-red",
  Held: "bg-amber/10 text-amber",
};

const RISK_TYPES: RiskType[] = [
  "fake_views",
  "spam",
  "copyright",
  "duplicate",
  "bot_traffic",
  "policy_violation",
  "account_sharing",
  "content_theft",
  "other",
];

export default function AdminRiskPage() {
  const { clips, campaigns, holdClip } = useStore();
  const [q, setQ] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "">("");
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flagType, setFlagType] = useState<RiskType>("other");
  const [flagSeverity, setFlagSeverity] = useState<Severity>("medium");
  const [flagNote, setFlagNote] = useState("");
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

  const flagged = useMemo(() => {
    return clips.filter((c) => {
      const flags = c.riskFlags ?? [];
      if (flags.length === 0) return false;
      if (
        q &&
        !c.clipper.toLowerCase().includes(q.toLowerCase()) &&
        !(campaigns.find((x) => x.id === c.campaignId)?.title ?? "")
          .toLowerCase()
          .includes(q.toLowerCase())
      )
        return false;
      if (severityFilter) {
        const hasSeverity = flags.some((f) => f.severity === severityFilter);
        if (!hasSeverity) return false;
      }
      if (statusFilter) {
        const hasStatus = flags.some((f) => (f.status ?? "New") === statusFilter);
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [clips, campaigns, q, severityFilter, statusFilter]);

  return (
    <div className="mx-auto max-w-[1120px] space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Risk
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Monitor suspicious activity, flagged accounts, and potential payout or campaign issues.
        </p>
      </div>

      {/* ── Summary ─────────────────────────────────────── */}
      <div className="flex items-center gap-6 text-[14px]">
        <span className="text-muted">
          <span className="font-semibold text-foreground">{flagged.length}</span>{" "}
          flagged clip{flagged.length !== 1 ? "s" : ""}
        </span>
        {severityFilter && (
          <button
            onClick={() => setSeverityFilter("")}
            className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-muted hover:text-foreground"
          >
            <X size={12} /> Clear severity
          </button>
        )}
        {statusFilter && (
          <button
            onClick={() => setStatusFilter("")}
            className="inline-flex cursor-pointer items-center gap-1 text-[13px] text-muted hover:text-foreground"
          >
            <X size={12} /> Clear status
          </button>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clipper or campaign…"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
          className="h-11 cursor-pointer rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RiskStatus | "")}
          className="h-11 cursor-pointer rounded-[10px] border border-border/60 bg-card px-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
        >
          <option value="">All statuses</option>
          <option value="New">New</option>
          <option value="Under Review">Under Review</option>
          <option value="Cleared">Cleared</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Held">Held</option>
        </select>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border/40 text-left text-[13px] text-muted">
              <th className="px-5 py-3.5 font-medium">Clip</th>
              <th className="px-5 py-3.5 font-medium">Clipper</th>
              <th className="px-5 py-3.5 font-medium">Campaign</th>
              <th className="px-5 py-3.5 font-medium">Platform</th>
              <th className="px-5 py-3.5 text-right font-medium">Views</th>
              <th className="px-5 py-3.5 font-medium">Top flag</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
              <th className="px-5 py-3.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {flagged.map((c) => {
              const camp = campaigns.find((x) => x.id === c.campaignId);
              const flags = c.riskFlags ?? [];
              const topFlag = flags[flags.length - 1];
              const expanded = expandedId === c.id;
              return (
                <FragmentRow
                  key={c.id}
                  colSpan={8}
                  extra={
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        className="h-9 cursor-pointer rounded-[8px] border border-border/60 px-3.5 text-[13px] font-medium transition-colors hover:bg-accent-soft"
                      >
                        {expanded ? "Close" : "Review"}
                      </button>
                      <button
                        onClick={() => holdClip(c.id, "Risk review held")}
                        className="h-9 cursor-pointer rounded-[8px] border border-red/20 px-3.5 text-[13px] font-medium text-red transition-colors hover:bg-red/5"
                      >
                        Hold
                      </button>
                    </div>
                  }
                  audit={
                    expanded ? (
                      <div className="mt-3 space-y-3 rounded-[10px] border border-border/40 bg-background/50 p-4">
                        <div className="space-y-2">
                          {flags.map((f, i) => (
                            <div key={i} className="flex items-start gap-2.5 text-[13px]">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/40" />
                              <div>
                                <span
                                  className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_COLORS[f.severity]}`}
                                >
                                  {f.type.replace(/_/g, " ")}
                                </span>
                                <span className="ml-1.5 text-muted">{f.note}</span>
                                {f.at && (
                                  <span className="ml-1.5 text-[12px] text-muted">
                                    {new Date(f.at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {flaggingId === c.id ? (
                          <div className="space-y-3 rounded-[10px] border border-red/20 bg-red/5 p-4">
                            <p className="text-[13px] font-medium text-red">
                              Add risk flag
                            </p>
                            <select
                              value={flagType}
                              onChange={(e) => setFlagType(e.target.value as RiskType)}
                              className="h-10 w-full cursor-pointer rounded-[8px] border border-border/60 bg-card px-3 text-[13px] outline-none focus:border-foreground/30"
                            >
                              {RISK_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t.replace(/_/g, " ")}
                                </option>
                              ))}
                            </select>
                            <select
                              value={flagSeverity}
                              onChange={(e) => setFlagSeverity(e.target.value as Severity)}
                              className="h-10 w-full cursor-pointer rounded-[8px] border border-border/60 bg-card px-3 text-[13px] outline-none focus:border-foreground/30"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                            <textarea
                              value={flagNote}
                              onChange={(e) => setFlagNote(e.target.value)}
                              rows={2}
                              placeholder="Note…"
                              className="w-full resize-none rounded-[8px] border border-border/60 bg-card px-3 py-2 text-[13px] outline-none focus:border-foreground/30"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  holdClip(c.id, flagNote || "Risk flag added");
                                  setFlaggingId(null);
                                  setFlagNote("");
                                }}
                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] bg-red px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                              >
                                Add flag
                              </button>
                              <button
                                onClick={() => setFlaggingId(null)}
                                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-4 text-[13px] font-medium transition-colors hover:bg-accent-soft"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setFlaggingId(c.id)}
                            className="h-9 cursor-pointer rounded-[8px] border border-border/60 px-3.5 text-[13px] font-medium transition-colors hover:bg-accent-soft"
                          >
                            + Add flag
                          </button>
                        )}
                      </div>
                    ) : null
                  }
                >
                  <td className="px-5 py-3.5">
                    <p className="truncate font-medium">{c.caption}</p>
                  </td>
                  <td className="px-5 py-3.5 text-muted">@{c.clipper}</td>
                  <td className="px-5 py-3.5 text-muted">
                    {camp?.title ?? "Campaign"}
                  </td>
                  <td className="px-5 py-3.5">
                    {c.platform && <PlatformIcon p={c.platform} size={15} />}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-[13px]">
                    {fmtViews(c.views)}
                  </td>
                  <td className="px-5 py-3.5">
                    {topFlag && (
                      <span
                        className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_COLORS[topFlag.severity]}`}
                      >
                        {topFlag.type.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {topFlag?.status && (
                      <span
                        className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ${STATUS_COLORS[topFlag.status] ?? ""}`}
                      >
                        {topFlag.status}
                      </span>
                    )}
                  </td>
                </FragmentRow>
              );
            })}
            {flagged.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-[14px] text-muted"
                >
                  {clips.some((c) => (c.riskFlags ?? []).length > 0)
                    ? "No flagged clips match your filters."
                    : "No flagged clips. Flag clips from the review page or add flags here."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({
  colSpan,
  children,
  extra,
  audit,
}: {
  colSpan: number;
  children: React.ReactNode;
  extra: React.ReactNode;
  audit: React.ReactNode;
}) {
  return (
    <>
      <tr className="align-top">
        {children}
        <td className="px-5 py-3.5">
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
