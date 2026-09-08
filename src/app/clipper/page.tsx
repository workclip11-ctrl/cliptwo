"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Film,
  CheckCircle2,
  Wallet,
  ArrowRight,
  Link2,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";

export default function ClipperPage() {
  const { campaigns, clips, socialAccounts, financeRecords } = useStore();
  const { user } = useAuth();
  const router = useRouter();
  useAutoRefresh();

  const myClips = clips.filter((k) => k.userId && k.userId === user?.id);
  const myAccounts = socialAccounts.filter(
    (a) => a.userId && a.userId === user?.id,
  );
  const fin = financeOf(financeRecords, (r) => r.clipperId === user?.id);
  const openCampaigns = campaigns.filter(
    (c) => c.status === "open" && c.launchPaymentStatus === "verified",
  );
  const earnings = fin.total / 100;
  const approvedCount = fin.totalCount;
  const pendingCount = fin.pendingCount;
  const maxViews = Math.max(1, ...myClips.map((k) => k.verifiedViews ?? 0));
  const bestPayout = openCampaigns.reduce((m, c) => Math.max(m, c.payout), 0);
  const bestCampaign = openCampaigns.find((c) => c.payout === bestPayout);
  const displayedCampaigns = openCampaigns.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back, @{user?.name ?? user?.email ?? "clipper"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            Find campaigns, create clips and earn from your views.
          </p>
        </div>
        <button
          onClick={() => router.push("/clipper/campaigns")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Find Campaigns <ArrowRight size={14} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Open campaigns"
          value={String(openCampaigns.length)}
          icon={<LayoutGrid size={15} />}
        />
        <StatCard
          label="Submitted clips"
          value={String(myClips.length)}
          icon={<Film size={15} />}
        />
        <StatCard
          label="Approved clips"
          value={String(approvedCount)}
          hint={
            pendingCount > 0
              ? `${pendingCount} awaiting review`
              : "All reviewed"
          }
          icon={<CheckCircle2 size={15} />}
        />
        <StatCard
          label="Total earnings"
          value={rup(earnings)}
          hint="from approved clips"
          icon={<Wallet size={15} />}
          accent
        />
      </div>

      {/* Main content + sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left: Campaigns + Submissions */}
        <div className="space-y-6">
          {/* Live Campaigns */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Live campaigns</h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-muted">
                  {openCampaigns.length}
                </span>
              </div>
              {openCampaigns.length > 0 && (
                <Link
                  href="/clipper/campaigns"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                >
                  View all <ArrowRight size={12} />
                </Link>
              )}
            </div>

            {displayedCampaigns.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                <MegaphoneIcon />
                <p className="mt-3 text-sm font-medium">
                  No campaigns available right now
                </p>
                <p className="mt-1 text-xs text-muted">
                  Check back soon or browse all campaigns.
                </p>
                <button
                  onClick={() => router.push("/clipper/campaigns")}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Browse campaigns <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {displayedCampaigns.map((c) => {
                  const spent = campaignSpent(c, financeRecords);
                  const remaining = (c.budget ?? 0) - spent;
                  return (
                    <div
                      key={c.id}
                      className="group relative rounded-xl border bg-card p-4 transition-all hover:border-foreground/15 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-muted">
                              <PlatformIcon p={c.platform} size={11} />
                              {c.platform}
                            </span>
                            {c.niche && (
                              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-muted">
                                {c.niche}
                              </span>
                            )}
                          </div>
                          <Link
                            href={`/campaigns/${c.id}`}
                            className="mt-2 block text-sm font-semibold hover:underline underline-offset-2"
                          >
                            {c.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-muted">
                            by {c.creator}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-base font-semibold">
                            {rup(c.payout)}
                          </p>
                          <p className="text-[10px] text-muted">
                            per 1K views
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="font-mono text-xs font-medium">
                            {rup(c.payout)}
                          </p>
                          <p className="text-[10px] text-muted">CPM</p>
                        </div>
                        <div className="border-x border-border px-2">
                          <p className="font-mono text-xs font-medium">
                            {rup(remaining > 0 ? remaining : 0)}
                          </p>
                          <p className="text-[10px] text-muted">Budget left</p>
                        </div>
                        <div>
                          <p className="font-mono text-xs font-medium">
                            {c.daysLeft}d
                          </p>
                          <p className="text-[10px] text-muted">Days left</p>
                        </div>
                      </div>

                      <button
                        onClick={() => router.push(`/campaigns/${c.id}`)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
                      >
                        View Campaign <ArrowRight size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Submissions */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent submissions</h2>
              {myClips.length > 0 && (
                <Link
                  href="/clipper/submissions"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
                >
                  View all <ArrowRight size={12} />
                </Link>
              )}
            </div>

            {myClips.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                <Film className="mx-auto text-muted" size={20} />
                <p className="mt-3 text-sm font-medium">
                  No submissions yet
                </p>
                <p className="mt-1 text-xs text-muted">
                  Find a campaign and start clipping.
                </p>
                <button
                  onClick={() => router.push("/clipper/campaigns")}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                >
                  Find campaigns <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-2.5 font-medium">Campaign</th>
                        <th className="px-4 py-2.5 font-medium">Platform</th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Views
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Earnings
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {myClips.slice(0, 5).map((k) => {
                        const camp = campaigns.find(
                          (c) => c.id === k.campaignId,
                        );
                        const finRec = financeRecords.find(
                          (r) => r.clipId === k.id,
                        );
                        const earning =
                          (finRec?.netAmount ?? 0) / 100;
                        return (
                          <tr
                            key={k.id}
                            className="transition-colors hover:bg-accent-soft/50"
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={`/clip/${k.id}`}
                                className="font-medium hover:underline underline-offset-2"
                              >
                                {camp?.title ?? "Campaign"}
                              </Link>
                              <p className="max-w-[200px] truncate text-xs text-muted">
                                {k.caption}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {k.platform ? (
                                <PlatformIcon p={k.platform} size={14} />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {k.verifiedViews
                                ? fmtViews(k.verifiedViews)
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs">
                              {earning > 0 ? rup(earning) : "—"}
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
              </div>
            )}
          </section>

          {/* Performance */}
          <section>
            <h2 className="mb-3 text-sm font-semibold">Performance</h2>
            <div className="rounded-xl border bg-card p-4">
              {myClips.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm font-medium">
                    No performance data yet
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Submit your first clip to start tracking views.
                  </p>
                  <button
                    onClick={() => router.push("/clipper/campaigns")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Find campaigns <ArrowRight size={12} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {myClips.slice(0, 5).map((k) => {
                    const camp = campaigns.find(
                      (c) => c.id === k.campaignId,
                    );
                    const pct = ((k.verifiedViews ?? 0) / maxViews) * 100;
                    return (
                      <div key={k.id}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="truncate font-medium">
                            {camp?.title ?? "Clip"}
                          </span>
                          <span className="shrink-0 pl-2 font-mono text-muted">
                            {k.verifiedViews
                              ? fmtViews(k.verifiedViews)
                              : "0"}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                          <div
                            className={`h-full rounded-full transition-all ${
                              k.status === "approved"
                                ? "bg-foreground"
                                : "bg-border"
                            }`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right sidebar */}
        <aside className="space-y-4">
          {/* Connected Accounts */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Connected accounts
            </h3>
            <div className="mt-3 space-y-2">
              {myAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <Link2 className="mx-auto text-muted" size={16} />
                  <p className="mt-2 text-xs text-muted">
                    No accounts connected
                  </p>
                  <Link
                    href="/clipper/accounts"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                  >
                    Connect account <ArrowRight size={11} />
                  </Link>
                </div>
              ) : (
                myAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      <PlatformIcon p={a.platform} size={13} />
                      <span className="text-xs font-medium">{a.handle}</span>
                    </span>
                    <span
                      className={`text-[11px] font-medium ${
                        a.status === "verified" || a.status === "connected"
                          ? "text-green"
                          : a.status === "connecting"
                            ? "text-amber"
                            : "text-muted"
                      }`}
                    >
                      {a.status === "verified"
                        ? "Verified"
                        : a.status === "connected"
                          ? "Connected"
                          : a.status === "connecting"
                            ? "Connecting"
                            : "Not connected"}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Link
              href="/clipper/accounts"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent-soft"
            >
              Manage accounts <ArrowRight size={11} />
            </Link>
          </div>

          {/* Payout Status */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Payout status
            </h3>
            <div className="mt-3">
              <div className="flex items-baseline justify-between">
                <p className="text-xs text-muted">Balance</p>
                <p className="font-mono text-lg font-semibold">
                  {rup(earnings)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted">Status</span>
                <span
                  className={`font-medium ${
                    earnings > 0 ? "text-green" : "text-muted"
                  }`}
                >
                  {earnings > 0 ? "Available" : "No earnings yet"}
                </span>
              </div>
            </div>
            <Link
              href="/clipper/wallet"
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent-soft"
            >
              View wallet <ArrowRight size={11} />
            </Link>
          </div>

          {/* Best Opportunity */}
          {bestCampaign && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Best opportunity
              </h3>
              <div className="mt-3">
                <p className="text-sm font-semibold">{bestCampaign.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  by {bestCampaign.creator}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="font-mono text-xs font-semibold">
                      {rup(bestCampaign.payout)}
                    </p>
                    <p className="text-[10px] text-muted">CPM</p>
                  </div>
                  <div className="border-x border-border px-2">
                    <p className="font-mono text-xs font-semibold">
                      {rup(
                        (bestCampaign.budget ?? 0) -
                          campaignSpent(bestCampaign, financeRecords),
                      )}
                    </p>
                    <p className="text-[10px] text-muted">Left</p>
                  </div>
                  <div>
                    <p className="font-mono text-xs font-semibold">
                      {bestCampaign.daysLeft}d
                    </p>
                    <p className="text-[10px] text-muted">Days</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push(`/campaigns/${bestCampaign.id}`)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                View campaign <ArrowRight size={11} />
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function MegaphoneIcon() {
  return (
    <svg
      className="mx-auto text-muted"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 11 18-5v12L3 13v-2z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}
