"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, Ban, Archive, Search } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "near_budget", label: "Near Budget" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
];

export default function AdminCampaigns() {
  const { campaigns, clips, financeRecords, closeCampaign, deleteCampaign } = useStore();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    let list = [...campaigns];
    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (q.trim()) {
      const lq = q.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(lq) ||
          (c.creator ?? "").toLowerCase().includes(lq),
      );
    }
    return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [campaigns, q, statusFilter]);

  const counts = useMemo(() => ({
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === "open").length,
    open: campaigns.filter((c) => c.status === "open" || c.status === "near_budget" || c.status === "budget_reached").length,
    archived: campaigns.filter((c) => c.status === "archived").length,
  }), [campaigns]);

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Campaigns
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {counts.total} total · {counts.active} active · {counts.archived} archived
        </p>
      </div>

      {/* ── Summary metrics ─────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.total}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Total campaigns</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.active}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Active</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.open}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Open</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.archived}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Archived</p>
        </div>
      </div>

      {/* ── Toolbar: search + filters ───────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaigns or creators…"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`cursor-pointer rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                statusFilter === f.key
                  ? "bg-foreground text-background"
                  : "border border-border/50 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-[14px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Creator</th>
                <th className="px-5 py-3 text-right font-medium">Budget</th>
                <th className="px-5 py-3 font-medium">Spent</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Clips</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((c) => {
                const n = clips.filter((k) => k.campaignId === c.id).length;
                const budget = c.budget ?? 0;
                const spent = campaignSpent(c, financeRecords);
                const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                const isArchived = c.status === "archived";
                return (
                  <tr
                    key={c.id}
                    className={`transition-colors hover:bg-accent-soft/50 ${isArchived ? "opacity-50" : ""}`}
                  >
                    {/* Campaign */}
                    <td className="px-5 py-4">
                      <p className="font-medium">{c.title}</p>
                    </td>

                    {/* Creator */}
                    <td className="px-5 py-4 text-muted">{c.creator}</td>

                    {/* Budget */}
                    <td className="px-5 py-4 text-right font-mono text-[15px] font-semibold">
                      {rup(budget)}
                    </td>

                    {/* Spent */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[13px] text-muted">{rup(spent)}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <StatusPill status={c.status} />
                    </td>

                    {/* Clips */}
                    <td className="px-5 py-4 text-right font-mono text-[14px]">
                      {n}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {c.status === "open" && (
                          <button
                            onClick={() => closeCampaign(c.id)}
                            title="Close campaign"
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[8px] border border-border/60 transition-colors hover:bg-accent-soft"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                        <Link
                          href="/admin/clips"
                          title="View clips"
                          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[8px] border border-border/60 transition-colors hover:bg-accent-soft"
                        >
                          <Megaphone size={15} />
                        </Link>
                        {!isArchived && (
                          <button
                            onClick={() => {
                              if (confirm(`Archive campaign "${c.title}"?\n\nAll clips, earnings, and audit history will be preserved.`))
                                deleteCampaign(c.id);
                            }}
                            title="Archive campaign"
                            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[8px] border border-amber-500/30 text-amber-600 transition-colors hover:bg-amber-500/10"
                          >
                            <Archive size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <p className="text-[15px] font-medium">No campaigns found</p>
                    <p className="mt-1 text-[13px] text-muted">
                      {campaigns.length === 0
                        ? "Campaigns will appear here once created."
                        : "Try adjusting your search or filters."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
