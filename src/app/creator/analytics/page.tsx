"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import {
  BarChart3,
  Eye,
  Film,
  Users,
  Wallet,
  TrendingUp,
  Heart,
  PiggyBank,
} from "lucide-react";
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
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const received = creatorReceived(clips, campaigns, user?.id);
  const ov = analyticsOverview(received, campaigns, myCampaigns);

  if (received.length === 0) {
    return (
      <div className="space-y-8">
        <Header />
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-14 text-center">
          <BarChart3 size={28} className="text-muted" />
          <div>
            <p className="font-medium">No analytics yet</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Once clips are submitted to your campaigns, you&apos;ll see verified
              views, spend, engagement and breakdowns here — all computed from
              real submission data.
            </p>
          </div>
          <Link
            href="/creator/campaigns"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            View campaigns
          </Link>
        </div>
      </div>
    );
  }

  const viewsSeries = seriesByDay(received, (k) => k.views);
  const spendSeries = seriesByDay(received, (k) => clipEarnings(k, campaigns));
  const clipsSeries = seriesByDay(received, () => 1);
  const platformViews = viewsByPlatform(received);
  const spendByCamp = spendByCampaign(received, campaigns).map((s) => ({
    ...s,
    href: `/creator/analytics/${s.id}`,
  }));
  const topClipperList = topClippers(received, campaigns, 8);

  return (
    <div className="space-y-8">
      <Header />

      {/* Overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label="Total verified views"
          value={fmtViews(ov.totalVerifiedViews)}
          icon={<Eye size={15} />}
        />
        <Kpi label="Total clips" value={String(ov.totalClips)} icon={<Film size={15} />} />
        <Kpi
          label="Active clippers"
          value={String(ov.activeClippers)}
          icon={<Users size={15} />}
        />
        <Kpi
          label="Total campaign spend"
          value={rup(ov.totalSpend)}
          icon={<Wallet size={15} />}
        />
        <Kpi
          label="Average CPM"
          value={ov.avgCPM != null ? rup(ov.avgCPM) : "—"}
          icon={<TrendingUp size={15} />}
        />
        <Kpi
          label="Total engagement"
          value={ov.totalEngagement != null ? fmtViews(ov.totalEngagement) : "—"}
          icon={<Heart size={15} />}
          hint="likes + comments + shares"
        />
        <Kpi
          label="Remaining budget"
          value={rup(ov.remainingBudget)}
          icon={<PiggyBank size={15} />}
          hint={`of ${rup(ov.totalBudget)} allocated`}
        />
      </div>

      {/* Charts */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Trends
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Views over time">
            <TimeSeriesChart data={viewsSeries} format={fmtViews} />
          </ChartCard>
          <ChartCard title="Spend over time">
            <TimeSeriesChart data={spendSeries} format={rup} />
          </ChartCard>
          <ChartCard title="Clips submitted over time">
            <TimeSeriesChart data={clipsSeries} />
          </ChartCard>
        </div>
      </section>

      {/* Breakdowns */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Breakdowns
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Views by platform">
            <BreakdownBars items={platformViews} format={fmtViews} />
          </ChartCard>
          <ChartCard title="Spend by campaign">
            <p className="mb-2 text-xs text-muted">
              Click a campaign for its full analytics.
            </p>
            <BreakdownBars items={spendByCamp} format={rup} />
          </ChartCard>
        </div>
      </section>

      {/* Top clippers */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Top clippers
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {topClipperList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              No clippers yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Clipper</th>
                  <th className="px-4 py-3 text-right font-medium">Views</th>
                  <th className="px-4 py-3 text-right font-medium">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topClipperList.map((c, i) => (
                  <tr key={c.handle}>
                    <td className="px-4 py-3 font-mono text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">@{c.handle}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {fmtViews(c.views)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {rup(c.earned)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Top clips */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Top clips
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <TopClipsTable clips={received} campaigns={campaigns} />
        </div>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-sm text-muted">
          Performance across all your campaigns, computed from real submission
          data.
        </p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <span className="text-muted">{icon}</span>
      </div>
      <p className="mt-1.5 font-mono text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {children}
    </div>
  );
}
