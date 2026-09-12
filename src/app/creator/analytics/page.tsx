"use client";

import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import {
  creatorReceived,
  analyticsOverview,
  seriesByDay,
  viewsByPlatform,
  spendByCampaign,
  topClippers,
} from "@/lib/analytics";
import { TimeSeriesChart, BreakdownBars } from "@/components/charts";
import { TopClipsTable } from "@/components/TopClipsTable";

export default function CreatorAnalyticsPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );
  const received = creatorReceived(clips, campaigns, user?.id);
  const ov = analyticsOverview(received, campaigns, myCampaigns);

  if (received.length === 0) {
    return (
      <div className="mx-auto max-w-[1120px] space-y-14 px-5 py-10 sm:px-8">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            Analytics
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Performance across all your campaigns, computed from real submission
            data.
          </p>
        </div>
        <div className="py-20 text-center">
          <BarChart3 size={32} className="mx-auto mb-3 text-border" />
          <p className="text-[16px] font-medium">No analytics yet</p>
          <p className="mt-2 mx-auto max-w-md text-[14px] text-muted leading-relaxed">
            Once clips are submitted to your campaigns, you&apos;ll see verified
            views, spend, engagement and breakdowns here — all computed from real
            submission data.
          </p>
          <Link
            href="/creator/campaigns"
            className="mt-6 inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 sm:h-11"
          >
            View campaigns <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const viewsSeries = seriesByDay(received, (k) => k.verifiedViews ?? 0);
  const spendSeries = seriesByDay(received, (k) => clipEarnings(k, campaigns));
  const clipsSeries = seriesByDay(received, () => 1);
  const platformViews = viewsByPlatform(received);
  const spendByCamp = spendByCampaign(received, campaigns).map((s) => ({
    ...s,
    href: `/creator/analytics/${s.id}`,
  }));
  const topClipperList = topClippers(received, campaigns, 8);

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Analytics
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Performance across all your campaigns, computed from real submission
          data.
        </p>
      </div>

      {/* ── Primary performance ─────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline gap-x-14 gap-y-6">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">
              Total views
            </p>
            <p className="font-mono text-[36px] font-bold tracking-tight leading-none">
              {fmtViews(ov.totalVerifiedViews)}
            </p>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-muted">
              Total spend
            </p>
            <p className="font-mono text-[36px] font-bold tracking-tight leading-none text-amber">
              {rup(ov.totalSpend)}
            </p>
          </div>
        </div>

        {/* Supporting metrics */}
        <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[14px]">
          <span>
            <span className="text-muted">Clips </span>
            <span className="font-medium">{ov.totalClips}</span>
          </span>
          <span>
            <span className="text-muted">Active clippers </span>
            <span className="font-medium">{ov.activeClippers}</span>
          </span>
          <span>
            <span className="text-muted">Avg CPM </span>
            <span className="font-medium">
              {ov.avgCPM != null ? rup(ov.avgCPM) : "—"}
            </span>
          </span>
          <span>
            <span className="text-muted">Engagement </span>
            <span className="font-medium">
              {ov.totalEngagement != null ? fmtViews(ov.totalEngagement) : "—"}
            </span>
          </span>
          <span>
            <span className="text-muted">Remaining </span>
            <span className="font-medium text-green">
              {rup(ov.remainingBudget)}
            </span>
            <span className="text-muted">
              {" "}of {rup(ov.totalBudget)}
            </span>
          </span>
        </div>
      </section>

      {/* ── Performance over time ───────────────────────── */}
      <section>
        <h2 className="mb-5 text-[18px] font-bold tracking-tight">
          Performance over time
        </h2>

        {/* Views — dominant chart */}
        <div className="mb-4 rounded-[12px] border border-border/40 bg-card p-5">
          <p className="mb-3 text-[15px] font-medium">Views over time</p>
          <TimeSeriesChart data={viewsSeries} format={fmtViews} />
        </div>

        {/* Spend + Clips — supporting charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[12px] border border-border/40 bg-card p-5">
            <p className="mb-3 text-[15px] font-medium">Spend over time</p>
            <TimeSeriesChart data={spendSeries} format={rup} />
          </div>
          <div className="rounded-[12px] border border-border/40 bg-card p-5">
            <p className="mb-3 text-[15px] font-medium">
              Clips submitted over time
            </p>
            <TimeSeriesChart data={clipsSeries} />
          </div>
        </div>
      </section>

      {/* ── Breakdowns ──────────────────────────────────── */}
      <section>
        <h2 className="mb-5 text-[18px] font-bold tracking-tight">
          Breakdowns
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[12px] border border-border/40 bg-card p-5">
            <p className="mb-3 text-[15px] font-medium">Views by platform</p>
            <BreakdownBars items={platformViews} format={fmtViews} />
          </div>
          <div className="rounded-[12px] border border-border/40 bg-card p-5">
            <p className="mb-1 text-[15px] font-medium">Spend by campaign</p>
            <p className="mb-3 text-[13px] text-muted">
              Click a campaign for its full analytics.
            </p>
            <BreakdownBars items={spendByCamp} format={rup} />
          </div>
        </div>
      </section>

      {/* ── Top clippers ────────────────────────────────── */}
      <section>
        <h2 className="mb-5 text-[18px] font-bold tracking-tight">
          Top clippers
        </h2>
        {topClipperList.length === 0 ? (
          <p className="text-[14px] text-muted">No clippers yet.</p>
        ) : (
          <div className="space-y-0 divide-y divide-border/40">
            {topClipperList.map((c, i) => (
              <div
                key={c.handle}
                className="flex items-baseline justify-between gap-4 py-4"
              >
                <div className="flex items-baseline gap-4">
                  <span className="w-6 text-[13px] font-mono text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] font-semibold">
                    @{c.handle}
                  </span>
                </div>
                <div className="flex items-baseline gap-6 text-[14px]">
                  <span className="font-mono font-medium">
                    {fmtViews(c.views)}
                    <span className="ml-1 text-muted font-normal">views</span>
                  </span>
                  <span className="font-mono font-medium text-amber">
                    {rup(c.earned)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Top clips ───────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[18px] font-bold tracking-tight">
          Top clips
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Strongest-performing submitted clips across all campaigns.
        </p>
        <TopClipsTable clips={received} campaigns={campaigns} />
      </section>
    </div>
  );
}
