"use client";

import Link from "next/link";
import { Megaphone, Ban, Trash2 } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup } from "@/lib/format";

export default function AdminCampaigns() {
  const { campaigns, clips, closeCampaign, deleteCampaign } = useStore();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} across all creators.
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
              const spent = c.spent ?? 0;
              const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
              return (
                <tr key={c.id}>
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
                      <button
                        onClick={() => {
                          if (confirm(`Delete campaign "${c.title}"?`))
                            deleteCampaign(c.id);
                        }}
                        title="Delete"
                        className="rounded-md border px-2 py-1 text-xs font-medium text-red hover:bg-red-500/10"
                      >
                        <Trash2 size={13} />
                      </button>
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
