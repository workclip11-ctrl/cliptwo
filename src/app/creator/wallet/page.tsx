"use client";

import Link from "next/link";
import {
  Wallet,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { campaignSpent, PLATFORM_FEE_RATE } from "@/lib/finance";
import { PlatformIcon } from "@/components/PlatformIcon";

export default function CreatorWalletPage() {
  const { campaigns, financeRecords } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );

  const totalBudget = myCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent =
    myCampaigns.reduce((s, c) => s + campaignSpent(c, financeRecords), 0) / 100;
  const totalRemaining = totalBudget - totalSpent;
  const utilizationPct =
    totalBudget > 0
      ? Math.min(100, Math.round((totalSpent / totalBudget) * 100))
      : 0;

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Wallet
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Campaign budgets, spending, and payouts at a glance.
        </p>
      </div>

      {/* ── Wallet overview ─────────────────────────────── */}
      <section>
        <p className="mb-2 text-[13px] font-medium text-muted">Total budget</p>
        <p className="font-mono text-[36px] font-bold tracking-tight leading-none">
          {rup(totalBudget)}
        </p>
        <p className="mt-2 text-[14px] text-muted">
          Across {myCampaigns.length} campaign{myCampaigns.length !== 1 ? "s" : ""}
        </p>

        {/* Spent / Remaining */}
        <div className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
          <div>
            <span className="text-[13px] text-muted">Total spent </span>
            <span className="font-mono text-[18px] font-bold text-amber">
              {rup(totalSpent)}
            </span>
          </div>
          <div>
            <span className="text-[13px] text-muted">Remaining </span>
            <span className="font-mono text-[18px] font-bold text-green">
              {rup(totalRemaining)}
            </span>
          </div>
        </div>

        {/* Utilization */}
        {totalBudget > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-baseline gap-2 text-[14px]">
              <span className="text-muted">
                Spent {rup(totalSpent)} of {rup(totalBudget)}
              </span>
              <span className="font-medium">{utilizationPct}% utilized</span>
            </div>
            <div className="h-[6px] w-full max-w-lg overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Campaign budgets ────────────────────────────── */}
      <section>
        <h2 className="mb-5 text-[18px] font-bold tracking-tight">
          Campaign budgets
        </h2>

        {myCampaigns.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[16px] font-medium">No campaigns yet</p>
            <p className="mt-2 text-[14px] text-muted">
              Create your first campaign to start tracking budget, spending, and
              payouts.
            </p>
            <Link
              href="/creator/campaigns/new"
              className="mt-5 inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 sm:h-11"
            >
              Create campaign <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myCampaigns.map((c) => {
              const spentPaise = campaignSpent(c, financeRecords);
              const spent = spentPaise / 100;
              const remaining = (c.budget ?? 0) - spent;
              const pct = c.budget
                ? Math.min(100, Math.round((spent / c.budget) * 100))
                : 0;
              const clipCount = financeRecords.filter(
                (r) => r.campaignId === c.id,
              ).length;
              const paidCount = financeRecords.filter(
                (r) => r.campaignId === c.id && r.status === "paid",
              ).length;

              return (
                <article
                  key={c.id}
                  className="overflow-hidden rounded-[12px] border border-border/40 bg-card"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail */}
                    <div className="flex h-32 shrink-0 items-center justify-center overflow-hidden bg-accent-soft sm:h-auto sm:w-[200px]">
                      {c.thumbnails?.[0] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.thumbnails[0]}
                          alt={c.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PlatformIcon p={c.platform} size={28} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
                      {/* Title + payment state */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/creator/campaigns/${c.id}`}
                            className="cursor-pointer text-[16px] font-semibold leading-snug hover:underline underline-offset-2"
                          >
                            {c.title}
                          </Link>
                          <div className="mt-1 flex items-center gap-2 text-[13px] text-muted">
                            <PlatformIcon p={c.platform} size={13} />
                            <span>{c.platform}</span>
                            <span>·</span>
                            <span>{clipCount} clips</span>
                            <span>·</span>
                            <span>{c.daysLeft}d left</span>
                          </div>
                        </div>
                        {/* Payment state */}
                        <div className="shrink-0">
                          {paidCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green">
                              <CheckCircle2 size={14} /> Paid
                            </span>
                          ) : clipCount > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber">
                              <Clock size={14} /> Pending
                            </span>
                          ) : (
                            <span className="text-[13px] text-muted">
                              No clips
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Financial values */}
                      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[14px]">
                        <div>
                          <span className="text-muted">Budget </span>
                          <span className="font-mono font-semibold">
                            {rup(c.budget ?? 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted">Spent </span>
                          <span className="font-mono font-semibold text-amber">
                            {rup(spent)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted">Remaining </span>
                          <span className="font-mono font-semibold text-green">
                            {rup(remaining)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted">Payout / 1K </span>
                          <span className="font-mono text-muted">
                            {rup(c.payout)}
                          </span>
                        </div>
                      </div>

                      {/* Utilization bar */}
                      {(c.budget ?? 0) > 0 && (
                        <div>
                          <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
                            <span>{pct}% utilized</span>
                          </div>
                          <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-accent-soft">
                            <div
                              className="h-full rounded-full bg-foreground"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Payout info ─────────────────────────────────── */}
      <div className="flex items-start gap-3 text-[14px] text-muted">
        <Wallet size={15} className="mt-0.5 shrink-0 text-muted" />
        <p className="leading-relaxed">
          Payouts are settled weekly via UPI. A{" "}
          {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee applies to
          clipper earnings. Your campaign budget is only charged when clips are
          approved.
        </p>
      </div>
    </div>
  );
}
