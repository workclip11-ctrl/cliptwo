"use client";

import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  IndianRupee,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { campaignSpent, PLATFORM_FEE_RATE } from "@/lib/finance";

export default function CreatorWalletPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );

  const totalBudget = myCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent = myCampaigns.reduce((s, c) => s + campaignSpent(c, clips), 0);
  const totalRemaining = totalBudget - totalSpent;
  const utilizationPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Campaign budgets, spending, and payouts at a glance.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <IndianRupee size={16} className="text-muted" />
            <p className="text-xs text-muted">Total budget</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold">{rup(totalBudget)}</p>
          <p className="mt-1 text-[11px] text-muted">Across {myCampaigns.length} campaigns</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-amber" />
            <p className="text-xs text-muted">Total spent</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-amber">{rup(totalSpent)}</p>
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>{utilizationPct}% utilized</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-amber"
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-green" />
            <p className="text-xs text-muted">Remaining</p>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-green">{rup(totalRemaining)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee on clip payouts
          </p>
        </div>
      </div>

      {/* Campaign breakdown */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Campaign budgets
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 text-right font-medium">Budget</th>
                  <th className="px-4 py-3 text-right font-medium">Spent</th>
                  <th className="px-4 py-3 text-right font-medium">Remaining</th>
                  <th className="px-4 py-3 text-right font-medium">Payout / 1K</th>
                  <th className="px-4 py-3 text-center font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {myCampaigns.map((c) => {
                  const spent = campaignSpent(c, clips);
                  const remaining = (c.budget ?? 0) - spent;
                  const pct = c.budget
                    ? Math.min(100, Math.round((spent / c.budget) * 100))
                    : 0;
                  const clipCount = clips.filter((k) => k.campaignId === c.id).length;
                  const paidCount = clips.filter(
                    (k) => k.campaignId === c.id && k.status === "paid",
                  ).length;
                  const hasIssues = clips.some(
                    (k) => k.campaignId === c.id && k.status === "failed",
                  );
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/creator/campaigns/${c.id}`}
                          className="font-medium hover:text-accent"
                        >
                          {c.title}
                        </Link>
                        <p className="text-xs text-muted">
                          {c.platform} · {clipCount} clips · {c.daysLeft}d left
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {rup(c.budget ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono">{rup(spent)}</span>
                        <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-accent-soft">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-green">
                        {rup(remaining)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted">
                        {rup(c.payout)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {hasIssues ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red">
                            <AlertTriangle size={12} /> Issues
                          </span>
                        ) : paidCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green">
                            <CheckCircle2 size={12} /> Paid
                          </span>
                        ) : clipCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber">
                            <Clock size={12} /> Pending
                          </span>
                        ) : (
                          <span className="text-xs text-muted">No clips</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {myCampaigns.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              No campaigns yet.
            </p>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border bg-accent-soft p-4 text-sm text-muted">
        <Wallet size={16} className="mt-0.5 shrink-0" />
        <p>
          Payouts are settled weekly via UPI. A {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee applies to
          clipper earnings. Your campaign budget is only charged when clips are approved.
        </p>
      </div>
    </div>
  );
}
