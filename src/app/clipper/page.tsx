"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Link2,
  Image as ImageIcon,
  Wallet,
  Film,
  Megaphone,
} from "lucide-react";
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
  const displayedCampaigns = openCampaigns.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* ─── Welcome + Primary Action ─── */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
            Dashboard
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight">
            Welcome back, @{user?.name ?? user?.email ?? "clipper"}
          </h1>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
            Find your next campaign and turn views into earnings.
          </p>
        </div>
        <Link
          href="/clipper/campaigns"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
        >
          Find Campaigns
          <ArrowRight size={14} />
        </Link>
      </section>

      {/* ─── Earnings + Activity Summary ─── */}
      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        {/* Primary: Earnings */}
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <Wallet size={16} />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Total earnings
            </p>
            <p className="mt-0.5 text-[26px] font-bold leading-none tracking-tight">
              {rup(earnings)}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {earnings > 0
                ? "from approved clips"
                : "earnings will appear here"}
            </p>
          </div>
        </div>

        {/* Supporting: inline metrics */}
        <div className="flex items-center gap-5 sm:gap-6">
          <MetricBlock
            value={String(myClips.length)}
            label="Submitted"
          />
          <div className="h-7 w-px bg-border" />
          <MetricBlock
            value={String(approvedCount)}
            label="Approved"
            hint={
              pendingCount > 0 ? `${pendingCount} pending` : undefined
            }
          />
          <div className="h-7 w-px bg-border" />
          <MetricBlock
            value={String(openCampaigns.length)}
            label="Open"
          />
        </div>
      </section>

      {/* ─── Main: Campaigns + Sidebar ─── */}
      <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
        {/* ── Left: Campaign Discovery (Hero) ── */}
        <div className="space-y-8">
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold tracking-tight">
                  Live campaigns
                </h2>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-muted">
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
              <EmptyCampaigns onBrowse={() => router.push("/clipper/campaigns")} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {displayedCampaigns.map((c) => {
                  const spent = campaignSpent(c, financeRecords);
                  const remaining = (c.budget ?? 0) - spent;
                  const thumb = c.thumbnails?.[0];
                  return (
                    <Link
                      key={c.id}
                      href={`/campaigns/${c.id}`}
                      className="group overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                    >
                      {/* Thumbnail — media-first, ~50% of card */}
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
                            <ImageIcon size={22} className="text-muted/25" />
                          </div>
                        )}
                        {/* Badges overlay */}
                        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-[3px] text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                            <PlatformIcon p={c.platform} size={10} />
                            {c.platform}
                          </span>
                          {c.niche && (
                            <span className="rounded-md bg-white/90 px-2 py-[3px] text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
                              {c.niche}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-3.5">
                        <h3 className="text-[13px] font-bold leading-snug group-hover:underline underline-offset-2">
                          {c.title}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-muted">
                          by {c.creator}
                        </p>

                        <div className="mt-2.5 flex items-center gap-0 rounded-lg border bg-background">
                          <div className="flex-1 py-1.5 text-center">
                            <p className="font-mono text-[12px] font-bold">
                              {rup(c.payout)}
                            </p>
                            <p className="text-[9px] text-muted">CPM</p>
                          </div>
                          <div className="h-5 w-px bg-border" />
                          <div className="flex-1 py-1.5 text-center">
                            <p className="font-mono text-[12px] font-bold">
                              {rup(remaining > 0 ? remaining : 0)}
                            </p>
                            <p className="text-[9px] text-muted">Left</p>
                          </div>
                          <div className="h-5 w-px bg-border" />
                          <div className="flex-1 py-1.5 text-center">
                            <p className="font-mono text-[12px] font-bold">
                              {c.daysLeft}d
                            </p>
                            <p className="text-[9px] text-muted">Days</p>
                          </div>
                        </div>

                        <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-accent py-1.5 text-[11px] font-medium text-white transition-all duration-200 group-hover:bg-foreground/90">
                          View Campaign
                          <ArrowRight size={10} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Recent Submissions ── */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight">
                Recent submissions
              </h2>
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
              <EmptySubmissions onBrowse={() => router.push("/clipper/campaigns")} />
            ) : (
              <div className="space-y-0 divide-y divide-border/50">
                {myClips.slice(0, 5).map((k) => {
                  const camp = campaigns.find(
                    (c) => c.id === k.campaignId,
                  );
                  const finRec = financeRecords.find(
                    (r) => r.clipId === k.id,
                  );
                  const earning = (finRec?.netAmount ?? 0) / 100;
                  const thumb = camp?.thumbnails?.[0];
                  return (
                    <Link
                      key={k.id}
                      href={`/clip/${k.id}`}
                      className="group flex items-center gap-3.5 py-3 transition-colors duration-150"
                    >
                      {/* Thumbnail */}
                      <div className="h-9 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                        {thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumb}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon
                              size={12}
                              className="text-muted/30"
                            />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium group-hover:underline underline-offset-2">
                          {camp?.title ?? "Campaign"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                          {k.platform && (
                            <PlatformIcon p={k.platform} size={11} />
                          )}
                          <span className="truncate max-w-[140px]">
                            {k.caption}
                          </span>
                        </p>
                      </div>

                      {/* Right side: views, earnings, status */}
                      <div className="hidden shrink-0 items-center gap-4 text-right sm:flex">
                        <div>
                          <p className="font-mono text-[11px] font-medium">
                            {k.verifiedViews
                              ? fmtViews(k.verifiedViews)
                              : "—"}
                          </p>
                          <p className="text-[9px] text-muted">views</p>
                        </div>
                        <div>
                          <p className="font-mono text-[11px] font-medium">
                            {earning > 0 ? rup(earning) : "—"}
                          </p>
                          <p className="text-[9px] text-muted">earned</p>
                        </div>
                        <StatusPill status={k.status} />
                      </div>

                      {/* Mobile: compact right */}
                      <div className="flex shrink-0 items-center gap-2 sm:hidden">
                        <span className="font-mono text-[11px] font-medium text-muted">
                          {k.verifiedViews
                            ? fmtViews(k.verifiedViews)
                            : "—"}
                        </span>
                        <StatusPill status={k.status} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Performance ── */}
          <section>
            <h2 className="mb-4 text-base font-bold tracking-tight">
              Performance
            </h2>
            {myClips.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card py-8 text-center">
                <p className="text-sm font-medium">No performance data yet</p>
                <p className="mt-1 text-xs text-muted">
                  Submit your first clip to start tracking views.
                </p>
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-border/50">
                {myClips.slice(0, 5).map((k, i) => {
                  const camp = campaigns.find(
                    (c) => c.id === k.campaignId,
                  );
                  const pct = ((k.verifiedViews ?? 0) / maxViews) * 100;
                  const thumb = camp?.thumbnails?.[0];
                  return (
                    <div key={k.id} className="flex items-center gap-3 py-3">
                      <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-accent-soft">
                        {thumb ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={thumb}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon
                              size={12}
                              className="text-muted/30"
                            />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-[13px] font-medium">
                            {camp?.title ?? "Clip"}
                          </span>
                          <span className="shrink-0 pl-2 font-mono text-[11px] font-medium text-muted">
                            {k.verifiedViews
                              ? fmtViews(k.verifiedViews)
                              : "0"}
                          </span>
                        </div>
                        <div className="mt-1.5 h-[4px] w-full overflow-hidden rounded-full bg-accent-soft">
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
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Right: Supporting Info Rail ── */}
        <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          {/* Connected Accounts */}
          <div>
            <h3 className="mb-2.5 text-xs font-semibold text-foreground">
              Connected accounts
            </h3>
            {myAccounts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center">
                <Link2 className="mx-auto text-muted" size={16} />
                <p className="mt-2 text-[11px] text-muted">
                  No accounts connected
                </p>
                <Link
                  href="/clipper/accounts"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                >
                  Connect account <ArrowRight size={10} />
                </Link>
              </div>
            ) : (
              <div className="space-y-0.5">
                {myAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-accent-soft/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon p={a.platform} size={12} />
                      <span className="text-[13px] font-medium">{a.handle}</span>
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
                ))}
                <Link
                  href="/clipper/accounts"
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors duration-150 hover:bg-accent-soft"
                >
                  Manage accounts <ArrowRight size={9} />
                </Link>
              </div>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Wallet */}
          <div>
            <h3 className="mb-2.5 text-xs font-semibold text-foreground">
              Wallet
            </h3>
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-lg font-bold">{rup(earnings)}</p>
              <span
                className={`text-[10px] font-medium ${
                  earnings > 0 ? "text-green" : "text-muted"
                }`}
              >
                {earnings > 0 ? "Available" : "No earnings yet"}
              </span>
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
            <>
              <div className="h-px bg-border" />
              <div>
                <h3 className="mb-2.5 text-xs font-semibold text-foreground">
                  Best opportunity
                </h3>
                <p className="text-[13px] font-bold leading-snug">
                  {bestCampaign.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  by {bestCampaign.creator}
                </p>
                <div className="mt-2.5 flex items-center gap-0 rounded-lg border bg-background">
                  <div className="flex-1 py-1.5 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {rup(bestCampaign.payout)}
                    </p>
                    <p className="text-[9px] text-muted">CPM</p>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex-1 py-1.5 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {rup(
                        (bestCampaign.budget ?? 0) -
                          campaignSpent(bestCampaign, financeRecords),
                      )}
                    </p>
                    <p className="text-[9px] text-muted">Left</p>
                  </div>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex-1 py-1.5 text-center">
                    <p className="font-mono text-[11px] font-bold">
                      {bestCampaign.daysLeft}d
                    </p>
                    <p className="text-[9px] text-muted">Days</p>
                  </div>
                </div>
                <Link
                  href={`/campaigns/${bestCampaign.id}`}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
                >
                  View campaign <ArrowRight size={10} />
                </Link>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ─── Local helpers ─── */

function MetricBlock({
  value,
  label,
  hint,
}: {
  icon?: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted">{hint}</p>
      )}
    </div>
  );
}

function EmptyCampaigns({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <Megaphone className="mx-auto text-muted" size={22} strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium">
        No campaigns available right now
      </p>
      <p className="mt-1 text-xs text-muted">
        Check back soon or browse all campaigns.
      </p>
      <button
        onClick={onBrowse}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
      >
        Browse campaigns <ArrowRight size={11} />
      </button>
    </div>
  );
}

function EmptySubmissions({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <Film className="mx-auto text-muted" size={22} strokeWidth={1.5} />
      <p className="mt-3 text-sm font-medium">No submissions yet</p>
      <p className="mt-1 text-xs text-muted">
        Find a campaign and start clipping.
      </p>
      <button
        onClick={onBrowse}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
      >
        Find campaigns <ArrowRight size={11} />
      </button>
    </div>
  );
}
