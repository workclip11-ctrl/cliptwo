"use client";

import Link from "next/link";
import { Megaphone, Ban, Archive } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";

export default function AdminCampaigns() {
  const { campaigns, clips, financeRecords, closeCampaign, deleteCampaign } = useStore();

  const activeCampaigns = campaigns.filter((c) => c.status !== "archived");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          {activeCampaigns.length} active campaign{activeCampaigns.length === 1 ? "" : "s"}
          {campaigns.length > activeCampaigns.length && (
            <span className="ml-2 text-xs text-muted">
              ({campaigns.length - activeCampaigns.length} archived)
            </span>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Creator</th>
              <th className="px-4 py-3 text-right font-medium">Budget</th>
              <th className="px-4 py-3 font-medium">Spent</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {campaigns.map((c) => {
              const n = clips.filter((k) => k.campaignId === c.id).length;
              const budget = c.budget ?? 0;
              const spent = campaignSpent(c, financeRecords);
              const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
              const isArchived = c.status === "archived";
              return (
                <tr key={c.id} className={isArchived ? "opacity-50" : ""}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.title}</p>
                    <p className="text-xs text-muted">{n} clips</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.creator}</td>
                  <td className="px-4 py-3 text-right font-mono">{rup(budget)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted/20">
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-xs text-muted">{rup(spent)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {c.status === "open" && (
                        <button
                          onClick={() => closeCampaign(c.id)}
                          title="Close"
                          className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent-soft"
                        >
                          <Ban size={13} />
                        </button>
                      )}
                      <Link
                        href="/admin/clips"
                        title="View clips"
                        className="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent-soft"
                      >
                        <Megaphone size={13} />
                      </Link>
                      {!isArchived && (
                        <button
                          onClick={() => {
                            if (confirm(`Archive campaign "${c.title}"?\n\nAll clips, earnings, and audit history will be preserved.`))
                              deleteCampaign(c.id);
                          }}
                          title="Archive campaign"
                          className="rounded-md border px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/10"
                        >
                          <Archive size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
