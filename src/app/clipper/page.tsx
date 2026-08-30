"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Film,
  CheckCircle2,
  Wallet,
  Sparkles,
  BadgeCheck,
  TrendingUp,
  Plus,
  Link2,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent, payoutSplit } from "@/lib/finance";

const ACCOUNTS = [
  { platform: "Instagram", handle: "@maya.cuts", status: "verified" },
  { platform: "YouTube", handle: "@mayacuts", status: "verified" },
  { platform: "TikTok", handle: "@maya.in", status: "connecting" },
];

export default function ClipperPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();
  const router = useRouter();

  const myClips = clips.filter((k) => k.userId === user?.id || !k.userId);
  const fin = financeOf(myClips, campaigns);
  const openCampaigns = campaigns.filter((c) => c.status === "open");
  const earnings = fin.earned;
  const approvedCount = fin.earnedCount;
  const pendingCount = fin.pendingCount;
  const maxViews = Math.max(1, ...myClips.map((k) => k.views));

  return (
    <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
              {(user?.name?.[0] ?? user?.email?.[0] ?? "C").toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome back, @{user?.name ?? user?.email ?? "clipper"}
              </h1>
              <p className="text-sm text-muted">Clipper dashboard</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-green">
            <BadgeCheck size={13} /> Paid via UPI
          </span>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Open campaigns"
            value={String(openCampaigns.length)}
            icon={<LayoutGrid size={16} />}
          />
          <StatCard
            label="Submitted"
            value={String(myClips.length)}
            icon={<Film size={16} />}
          />
          <StatCard
            label="Earned"
            value={String(approvedCount)}
            hint={`${pendingCount} awaiting review`}
            icon={<CheckCircle2 size={16} />}
          />
          <StatCard
            label="Total earnings"
            value={rup(earnings)}
            hint="from approved clips"
            icon={<Wallet size={16} />}
          />
        </div>

        {/* Browse campaigns + connected accounts */}
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Browse live campaigns
              </h2>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium">
                {openCampaigns.length}
              </span>
            </div>
            <div className="space-y-4">
              {openCampaigns.map((c) => {
                const spent = campaignSpent(c, clips);
                const remaining = (c.budget ?? 0) - spent;
                const pct = c.budget
                  ? Math.min(100, Math.round((spent / c.budget) * 100))
                  : 0;
                return (
                  <div key={c.id} className="rounded-2xl border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                            <Link
                              href={`/campaigns/${c.id}`}
                              className="font-semibold hover:underline underline-offset-2"
                            >
                            {c.title}
                          </Link>
                          <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium">
                            {c.platform}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          by {c.creator} · {c.niche}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-lg font-medium text-amber">
                          {rup(c.payout)}
                        </p>
                        <p className="text-[11px] text-muted">per 1K views</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-muted">{c.brief}</p>

                    <div className="mt-4">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                        <span>{rup(spent)} spent</span>
                        <span>{rup(remaining)} left</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                        <Sparkles size={13} /> {c.daysLeft} days left
                      </span>
                      <button
                        onClick={() => router.push(`/campaigns/${c.id}`)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      >
                        <Plus size={14} /> View campaign
                      </button>
                    </div>
                  </div>
                );
              })}
              {openCampaigns.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                  No open campaigns right now.
                </p>
              )}
            </div>
          </section>

          <aside>
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="text-sm font-semibold">Connected accounts</h3>
              <p className="mt-1 text-xs text-muted">
                Views are tracked automatically from linked accounts.
              </p>
              <div className="mt-4 space-y-2">
                {ACCOUNTS.map((a) => (
                  <div
                    key={a.platform}
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <PlatformIcon p={a.platform} size={15} />
                      <span className="font-mono text-xs">{a.handle}</span>
                    </span>
                    <span
                      className={`text-xs font-medium ${a.status === "verified" ? "text-green" : "text-amber"}`}
                    >
                      {a.status === "verified" ? "Verified" : "Connecting…"}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/clipper/settings"
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
              >
                <Link2 size={14} /> Manage accounts
              </Link>
            </div>

            <div className="mt-4 rounded-2xl border bg-foreground p-5 text-white">
              <p className="text-xs uppercase tracking-wide text-white/60">
                Best rate
              </p>
              <p className="mt-2 font-mono text-2xl font-medium">
                {rup(
                  openCampaigns.reduce((m, c) => Math.max(m, c.payout), 0),
                )}
                <span className="text-sm font-normal text-white/60"> / 1K</span>
              </p>
              <p className="mt-1 text-xs text-white/50">
                Highest payout per 1K views among open campaigns.
              </p>
            </div>
          </aside>
        </div>

        {/* Submissions + performance */}
        <div className="mt-10 grid gap-8 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              My submissions
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 text-right font-medium">Views</th>
                    <th className="px-4 py-3 text-right font-medium">Earnings</th>
                    <th className="px-4 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {myClips.map((k) => {
                    const camp = campaigns.find((c) => c.id === k.campaignId);
                    return (
                      <tr key={k.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/clip/${k.id}`}
                            className="font-medium hover:underline underline-offset-2"
                          >
                            {camp?.title ?? "Campaign"}
                          </Link>
                          <p className="max-w-[220px] truncate text-xs text-muted">
                            {k.caption}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {k.platform ? <PlatformIcon p={k.platform} size={15} /> : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {k.views ? fmtViews(k.views) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {payoutSplit(k, campaigns).net
                            ? rup(payoutSplit(k, campaigns).net)
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <StatusPill status={k.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              {myClips.length === 0 && (
                <p className="p-6 text-center text-sm text-muted">
                  You haven&apos;t submitted any clips yet.
                </p>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Performance
            </h2>
            <div className="rounded-2xl border bg-card p-5">
              {myClips.map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                return (
                  <div key={k.id} className="mb-4 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate font-medium">{camp?.title ?? "Clip"}</span>
                      <span className="font-mono text-muted">
                        {k.views ? fmtViews(k.views) : "0"}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
                      <div
                        className={`h-full rounded-full ${k.status === "approved" ? "bg-accent" : "bg-border"}`}
                        style={{ width: `${(k.views / maxViews) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {myClips.length === 0 && (
                <p className="text-center text-sm text-muted">
                  No data yet.
                </p>
              )}
              <div className="mt-4 flex items-center gap-2 border-t pt-4 text-xs text-muted">
                <TrendingUp size={14} className="text-green" />
                Earnings update when clips are approved.
              </div>
            </div>
          </section>
        </div>
    </div>
  );
}
