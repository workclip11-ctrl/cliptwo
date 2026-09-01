"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  Eye,
  Film,
  Users,
  Wallet,
  TrendingUp,
  Heart,
  PiggyBank,
  ArrowLeft,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import {
  creatorReceived,
  analyticsOverview,
  seriesByDay,
  viewsByPlatform,
  topClippers,
} from "@/lib/analytics";
import { TimeSeriesChart, BreakdownBars } from "@/components/charts";
import { TopClipsTable } from "@/components/TopClipsTable";
import { StatusPill } from "@/components/StatusPill";

export default function CampaignAnalyticsPage() {
  const params = useParams<{ campaignId: string }>();
  const id = params.campaignId;
  const { campaigns, clips } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );
  const camp = myCampaigns.find((c) => c.id === id);

  if (!camp) {
    return (
      <div className="space-y-8">
        <div>
          <Link
            href="/creator/analytics"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back to analytics
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            Campaign not found
          </h1>
          <p className="mt-1 text-sm text-muted">
            This campaign doesn&apos;t exist or isn&apos;t yours.
          </p>
        </div>
      </div>
    );
  }

  const received = creatorReceived(clips, campaigns, user?.id);
  const campClips = received.filter((k) => k.campaignId === id);
  const ov = analyticsOverview(campClips, campaigns, [camp]);

  const viewsSeries = seriesByDay(campClips, (k) => k.views);
  const spendSeries = seriesByDay(campClips, (k) => clipEarnings(k, campaigns));
  const clipsSeries = seriesByDay(campClips, () => 1);
  const platformViews = viewsByPlatform(campClips);
  const topClipperList = topClippers(campClips, campaigns, 8);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/creator/analytics"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to analytics
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {camp.title}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {camp.niche} · {camp.platform}
            </p>
          </div>
          <StatusPill status={camp.status} />
        </div>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi
          label="Total views"
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
          <ChartCard title="Top clippers">
            {topClipperList.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted">
                No clippers yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {topClipperList.map((c, i) => (
                    <tr key={c.handle}>
                      <td className="py-2.5 font-mono text-xs text-muted">
                        {i + 1}
                      </td>
                      <td className="py-2.5 font-medium">@{c.handle}</td>
                      <td className="py-2.5 text-right font-mono">
                        {fmtViews(c.views)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-muted">
                        {rup(c.earned)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ChartCard>
        </div>
      </section>

      {/* Top clips */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Top clips
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <TopClipsTable clips={campClips} campaigns={campaigns} />
        </div>
      </section>
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
