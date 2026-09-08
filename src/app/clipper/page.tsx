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
  Image as ImageIcon,
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, @{user?.name ?? user?.email ?? "clipper"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Find campaigns, create clips and earn from your views.
          </p>
        </div>
        <button
          onClick={() => router.push("/clipper/campaigns")}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
        >
          Find Campaigns{" "}
          <ArrowRight size={14} />
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
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Left: Campaigns + Submissions */}
        <div className="space-y-6">
          {/* Live Campaigns */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-bold tracking-tight">Live campaigns</h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-muted">
                  {openCampaigns.length}
                </span>
              </div>
              {openCampaigns.length > 0 && (
                <Link
                  href="/clipper/campaigns"
                  className="group inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
                >
                  View all
                  <ArrowRight
                    size={11}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
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
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
                >
                  Browse campaigns <ArrowRight size={11} />
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {displayedCampaigns.map((c) => {
                  const spent = campaignSpent(c, financeRecords);
                  const remaining = (c.budget ?? 0) - spent;
                  const thumb = c.thumbnails?.[0];
                  return (
                    <div
                      key={c.id}
                      className="group relative overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-accent-soft">
                        {thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumb}
                            alt={c.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon
                              size={20}
                              className="text-muted/30"
                            />
                          </div>
                        )}
                        {/* Platform + niche badges */}
                        <div className="absolute left-2 top-2 flex items-center gap-1">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                            <PlatformIcon p={c.platform} size={10} />
                            {c.platform}
                          </span>
                          {c.niche && (
                            <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                              {c.niche}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-3.5 pt-3">
                        <Link
                          href={`/campaigns/${c.id}`}
                          className="text-[13px] font-bold leading-snug hover:underline underline-offset-2"
                        >
                          {c.title}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted">
                          by {c.creator}
                        </p>

                        <div className="mt-3 flex items-center gap-0 rounded-lg border bg-background">
                          <div className="flex-1 py-2 text-center">
                            <p className="font-mono text-[13px] font-bold">
                              {rup(c.payout)}
                            </p>
                            <p className="text-[10px] text-muted">CPM</p>
                          </div>
                          <div className="h-6 w-px bg-border" />
                          <div className="flex-1 py-2 text-center">
                            <p className="font-mono text-[13px] font-bold">
                              {rup(remaining > 0 ? remaining : 0)}
                            </p>
                            <p className="text-[10px] text-muted">Left</p>
                          </div>
                          <div className="h-6 w-px bg-border" />
                          <div className="flex-1 py-2 text-center">
                            <p className="font-mono text-[13px] font-bold">
                              {c.daysLeft}d
                            </p>
                            <p className="text-[10px] text-muted">Left</p>
                          </div>
                        </div>

                        <button
                          onClick={() => router.push(`/campaigns/${c.id}`)}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
                        >
                          View Campaign <ArrowRight size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Recent Submissions */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight">Recent submissions</h2>
              {myClips.length > 0 && (
                <Link
                  href="/clipper/submissions"
                  className="group inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors duration-150 hover:text-foreground"
                >
                  View all
                  <ArrowRight
                    size={11}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              )}
            </div>

            {myClips.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card p-8 text-center">
                <Film className="mx-auto text-muted" size={20} />
                <p className="mt-3 text-sm font-medium">No submissions yet</p>
                <p className="mt-1 text-xs text-muted">
                  Find a campaign and start clipping.
                </p>
                <button
                  onClick={() => router.push("/clipper/campaigns")}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
                >
                  Find campaigns <ArrowRight size={11} />
                </button>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-hidden rounded-xl border bg-card sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-accent-soft/50 text-left text-[10px] uppercase tracking-wider text-muted">
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
                    <tbody className="divide-y divide-border/50">
                      {myClips.slice(0, 5).map((k) => {
                        const camp = campaigns.find(
                          (c) => c.id === k.campaignId,
                        );
                        const finRec = financeRecords.find(
                          (r) => r.clipId === k.id,
                        );
                        const earning = (finRec?.netAmount ?? 0) / 100;
                        return (
                          <tr
                            key={k.id}
                            className="transition-colors duration-150 hover:bg-accent-soft/40"
                          >
                            <td className="px-4 py-3">
                              <Link
                                href={`/clip/${k.id}`}
                                className="font-medium hover:underline underline-offset-2"
                              >
                                {camp?.title ?? "Campaign"}
                              </Link>
                              <p className="mt-0.5 max-w-[180px] truncate text-[11px] text-muted">
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

                {/* Mobile stacked cards */}
                <div className="space-y-2 sm:hidden">
                  {myClips.slice(0, 5).map((k) => {
                    const camp = campaigns.find(
                      (c) => c.id === k.campaignId,
                    );
                    const finRec = financeRecords.find(
                      (r) => r.clipId === k.id,
                    );
                    const earning = (finRec?.netAmount ?? 0) / 100;
                    return (
                      <Link
                        key={k.id}
                        href={`/clip/${k.id}`}
                        className="block rounded-xl border bg-card p-3 transition-all duration-200 hover:border-foreground/10 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium">
                              {camp?.title ?? "Campaign"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-muted">
                              {k.caption}
                            </p>
                          </div>
                          <StatusPill status={k.status} />
                        </div>
                        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
                          <span className="flex items-center gap-1">
                            {k.platform && (
                              <PlatformIcon p={k.platform} size={11} />
                            )}
                            {k.verifiedViews
                              ? fmtViews(k.verifiedViews) + " views"
                              : "No views yet"}
                          </span>
                          <span className="font-mono font-medium">
                            {earning > 0 ? rup(earning) : "—"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Performance */}
          <section>
            <h2 className="mb-4 text-sm font-bold tracking-tight">Performance</h2>
            <div className="rounded-xl border bg-card p-4">
              {myClips.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium">No performance data yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Submit your first clip to start tracking views.
                  </p>
                  <button
                    onClick={() => router.push("/clipper/campaigns")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
                  >
                    Find campaigns <ArrowRight size={11} />
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {myClips.slice(0, 5).map((k, i) => {
                    const camp = campaigns.find(
                      (c) => c.id === k.campaignId,
                    );
                    const pct = ((k.verifiedViews ?? 0) / maxViews) * 100;
                    return (
                      <div key={k.id}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="truncate text-xs font-medium">
                            {camp?.title ?? "Clip"}
                          </span>
                          <span className="shrink-0 pl-2 font-mono text-[11px] font-medium text-muted">
                            {k.verifiedViews
                              ? fmtViews(k.verifiedViews)
                              : "0"}
                          </span>
                        </div>
                        <div className="h-[5px] w-full overflow-hidden rounded-full bg-accent-soft">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              k.status === "approved"
                                ? "bg-foreground"
                                : "bg-border"
                            }`}
                            style={{
                              width: `${Math.max(pct, 3)}%`,
                              transitionDelay: `${i * 100}ms`,
                            }}
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
        <aside className="space-y-3">
          {/* Connected Accounts */}
          <div className="rounded-xl border bg-card p-3.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Connected accounts
            </h3>
            <div className="mt-2 space-y-1">
              {myAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed p-3 text-center">
                  <Link2 className="mx-auto text-muted" size={14} />
                  <p className="mt-1.5 text-[11px] text-muted">
                    No accounts connected
                  </p>
                  <Link
                    href="/clipper/accounts"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                  >
                    Connect account <ArrowRight size={10} />
                  </Link>
                </div>
              ) : (
                myAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-background px-2.5 py-2"
                  >
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon p={a.platform} size={11} />
                      <span className="text-xs font-medium">{a.handle}</span>
                    </span>
                    <span
                      className={`text-[10px] font-medium ${
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
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:bg-accent-soft"
            >
              Manage accounts <ArrowRight size={9} />
            </Link>
          </div>

          {/* Payout Status */}
          <div className="rounded-xl border bg-card p-3.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Payout status
            </h3>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] text-muted">Balance</p>
                <p className="font-mono text-lg font-bold leading-none">
                  {rup(earnings)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
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
              className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:bg-accent-soft"
            >
              View wallet <ArrowRight size={9} />
            </Link>
          </div>

          {/* Best Opportunity */}
          {bestCampaign && (
            <div className="rounded-xl border bg-card p-3.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Best opportunity
              </h3>
              <div className="mt-2">
                <p className="text-[13px] font-bold leading-snug">
                  {bestCampaign.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  by {bestCampaign.creator}
                </p>
                <div className="mt-2.5 flex items-center gap-0 rounded-lg border bg-background">
                  <div className="flex-1 py-2 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {rup(bestCampaign.payout)}
                    </p>
                    <p className="text-[9px] text-muted">CPM</p>
                  </div>
                  <div className="h-5 w-px bg-border" />
                  <div className="flex-1 py-2 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {rup(
                        (bestCampaign.budget ?? 0) -
                          campaignSpent(bestCampaign, financeRecords),
                      )}
                    </p>
                    <p className="text-[9px] text-muted">Left</p>
                  </div>
                  <div className="h-5 w-px bg-border" />
                  <div className="flex-1 py-2 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {bestCampaign.daysLeft}d
                    </p>
                    <p className="text-[9px] text-muted">Days</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push(`/campaigns/${bestCampaign.id}`)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 py-2 text-[11px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
              >
                View campaign <ArrowRight size={10} />
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
