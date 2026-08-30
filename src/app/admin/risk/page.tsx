"use client";

import { useMemo, useState } from "react";
import { Search, ShieldAlert, X } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { fmtViews } from "@/lib/format";
import type { RiskFlag, RiskType, Severity, RiskStatus } from "@/lib/types";

const SEVERITY_COLORS: Record<Severity, string> = {
  low: "bg-blue-500/10 text-blue-500",
  medium: "bg-amber/10 text-amber",
  high: "bg-red/10 text-red",
};

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-500/10 text-blue-500",
  "Under Review": "bg-amber/10 text-amber",
  Cleared: "bg-green/10 text-green",
  Confirmed: "bg-red/10 text-red",
  Held: "bg-purple-400/10 text-purple-400",
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
  const { clips, campaigns, setClipStatus } = useStore();
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldAlert size={22} />
          Fraud &amp; Risk
        </h1>
        <p className="mt-1 text-sm text-muted">
          Review flagged clips and manage risk across the platform.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clipper or campaign..."
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RiskStatus | "")}
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        >
          <option value="">All statuses</option>
          <option value="New">New</option>
          <option value="Under Review">Under Review</option>
          <option value="Cleared">Cleared</option>
          <option value="Confirmed">Confirmed</option>
          <option value="Held">Held</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Clip</th>
              <th className="px-4 py-3 font-medium">Clipper</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 text-right font-medium">Views</th>
              <th className="px-4 py-3 font-medium">Top Flag</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
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
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() =>
                          setExpandedId(expanded ? null : c.id)
                        }
                        className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                      >
                        {expanded ? "Close" : "Review"}
                      </button>
                      <button
                        onClick={() => {
                          setClipStatus(c.id, "held", { heldReason: "Risk review held" });
                        }}
                        className="rounded-md border px-2.5 py-1 text-xs font-medium text-red hover:bg-red-500/10"
                      >
                        Hold
                      </button>
                    </div>
                  }
                  audit={
                    expanded ? (
                      <div className="mt-3 space-y-3 rounded-lg border bg-background/50 p-3">
                        <div className="space-y-1">
                          {flags.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs"
                            >
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                              <div>
                                <span
                                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[f.severity]}`}
                                >
                                  {f.type.replace(/_/g, " ")}
                                </span>
                                <span className="ml-1 text-muted">
                                  {f.note}
                                </span>
                                {f.at && (
                                  <span className="ml-1 text-muted">
                                    {new Date(f.at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {flaggingId === c.id ? (
                          <div className="space-y-2 rounded-lg border border-red/30 bg-red/5 p-3">
                            <p className="text-xs font-medium text-red">
                              Add risk flag
                            </p>
                            <select
                              value={flagType}
                              onChange={(e) =>
                                setFlagType(e.target.value as RiskType)
                              }
                              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                            >
                              {RISK_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t.replace(/_/g, " ")}
                                </option>
                              ))}
                            </select>
                            <select
                              value={flagSeverity}
                              onChange={(e) =>
                                setFlagSeverity(e.target.value as Severity)
                              }
                              className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                            <textarea
                              value={flagNote}
                              onChange={(e) => setFlagNote(e.target.value)}
                              rows={2}
                              placeholder="Note..."
                              className="w-full resize-none rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-foreground"
                            />
                            <div className="flex gap-2">
                               <button
                                onClick={() => {
                                  const newFlag: RiskFlag = {
                                    type: flagType,
                                    severity: flagSeverity,
                                    note: flagNote || undefined,
                                    flaggedBy: "Admin",
                                    at: Date.now(),
                                    status: "New",
                                  };
                                  const updated = [...flags, newFlag];
                                  setClipStatus(c.id, c.status, {
                                    riskFlags: updated,
                                  });
                                  setFlaggingId(null);
                                  setFlagNote("");
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                              >
                                <ShieldAlert size={13} /> Add flag
                              </button>
                              <button
                                onClick={() => setFlaggingId(null)}
                                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium"
                              >
                                <X size={13} /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setFlaggingId(c.id)}
                            className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent-soft"
                          >
                            + Add flag
                          </button>
                        )}
                      </div>
                    ) : null
                  }
                >
                  <td className="px-4 py-3">
                    <p className="truncate font-medium">{c.caption}</p>
                  </td>
                  <td className="px-4 py-3">@{c.clipper}</td>
                  <td className="px-4 py-3 text-muted">
                    {camp?.title ?? "Campaign"}
                  </td>
                  <td className="px-4 py-3">
                    {c.platform && <PlatformIcon p={c.platform} size={15} />}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtViews(c.views)}
                  </td>
                  <td className="px-4 py-3">
                    {topFlag && (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[topFlag.severity]}`}
                      >
                        {topFlag.type.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {topFlag?.status && (
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[topFlag.status] ?? ""}`}
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
                  className="px-4 py-10 text-center text-sm text-muted"
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
