"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Megaphone,
  Film,
  Compass,
  BarChart3,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf } from "@/lib/finance";
import { seriesByDay } from "@/lib/analytics";
import { TimeSeriesChart } from "@/components/charts";
import type { Campaign } from "@/lib/types";

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

  const totalEarnings = fin.total / 100;
  const approvedEarnings = fin.processing / 100;
  const pendingEarnings = fin.pending / 100;
  const totalClips = fin.totalCount;
  const pendingCount = fin.pendingCount;
  const verifiedViews = myClips.reduce(
    (s, k) => s + (k.verifiedViews ?? 0),
    0,
  );
  const displayedCampaigns = openCampaigns.slice(0, 3);
  const viewsSeries = seriesByDay(myClips, (k) => k.verifiedViews ?? 0);

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Welcome ─────────────────────────────────────── */}
      <section>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
          Welcome back, @{user?.name ?? user?.email ?? "clipper"}! &#x1F44B;
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">
          Find campaigns worth clipping and turn views into earnings.
        </p>
        <Link
          href="/clipper/campaigns"
          className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-foreground px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
        >
          Find campaigns
        </Link>
      </section>

      {/* ── Earnings Overview ───────────────────────────── */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold tracking-tight">
            Earnings Overview
          </h2>
          <Link
            href="/clipper/wallet"
            className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
          >
            View all
            <ArrowRight
              size={13}
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total Earnings"
            value={rup(totalEarnings)}
            sub={
              totalEarnings > 0
                ? "from approved clips"
                : "No earnings yet"
            }
          />
          <MetricCard
            label="Approved Earnings"
            value={rup(approvedEarnings)}
            valueClass={approvedEarnings > 0 ? "text-green" : undefined}
          />
          <MetricCard
            label="Pending Earnings"
            value={rup(pendingEarnings)}
            valueClass={pendingEarnings > 0 ? "text-amber" : undefined}
          />
          <MetricCard
            label="Total Clips"
            value={String(totalClips)}
            sub={
              pendingCount > 0
                ? `${pendingCount} awaiting review`
                : undefined
            }
          />
        </div>
      </section>

      {/* ── Campaigns worth clipping ────────────────────── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold tracking-tight">
            Campaigns worth clipping
          </h2>
          {openCampaigns.length > 0 && (
            <Link
              href="/clipper/campaigns"
              className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              View all
              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          )}
        </div>

        {displayedCampaigns.length === 0 ? (
          <EmptyCampaigns onBrowse={() => router.push("/clipper/campaigns")} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {displayedCampaigns.map((c) => (
                <CampaignCardLarge
                  key={c.id}
                  campaign={c}
                />
              ))}
          </div>
        )}
      </section>

      {/* ── My recent clips + Performance ───────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* My recent clips */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              My recent clips
            </h2>
            {myClips.length > 0 && (
              <Link
                href="/clipper/submissions"
                className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
              >
                View all
                <ArrowRight
                  size={13}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            )}
          </div>

          {myClips.length === 0 ? (
            <EmptySubmissions
              onBrowse={() => router.push("/clipper/campaigns")}
            />
          ) : (
            <div className="space-y-0 divide-y divide-border/50">
              {myClips.slice(0, 5).map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                const finRec = financeRecords.find((r) => r.clipId === k.id);
                const earning = (finRec?.netAmount ?? 0) / 100;
                const thumb = camp?.thumbnails?.[0];
                return (
                  <Link
                    key={k.id}
                    href={`/clip/${k.id}`}
                    className="group flex items-center gap-3.5 py-3 transition-colors duration-150 sm:gap-4"
                  >
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft">
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <PlatformIcon
                            p={k.platform ?? "Instagram"}
                            size={14}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium group-hover:underline underline-offset-2">
                        {camp?.title ?? "Campaign"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                        {k.platform && (
                          <PlatformIcon p={k.platform} size={12} />
                        )}
                        <span className="truncate max-w-[160px]">
                          {k.caption}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                      <div className="text-right">
                        <p className="font-mono text-[13px] font-semibold">
                          {k.verifiedViews ? fmtViews(k.verifiedViews) : "\u2014"}
                        </p>
                        <p className="text-[10px] text-muted">views</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[13px] font-semibold">
                          {earning > 0 ? rup(earning) : "\u2014"}
                        </p>
                        <p className="text-[10px] text-muted">earned</p>
                      </div>
                      <StatusPill status={k.status} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Performance */}
        <section>
          <h2 className="mb-4 text-[17px] font-bold tracking-tight">
            Performance (30 days)
          </h2>
          {myClips.length === 0 ? (
            <div className="rounded-[14px] border border-dashed bg-card py-12 text-center">
              <p className="text-[15px] font-medium">No performance data yet</p>
              <p className="mt-1.5 text-[13px] text-muted">
                Submit your first clip to start tracking views.
              </p>
            </div>
          ) : (
            <div className="rounded-[14px] border bg-card p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <p className="text-[12px] text-muted">Total views</p>
                  <p className="mt-1 font-mono text-[22px] font-bold tracking-tight">
                    {fmtViews(verifiedViews)}
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-muted">Total earnings</p>
                  <p className="mt-1 font-mono text-[22px] font-bold tracking-tight">
                    {rup(totalEarnings)}
                  </p>
                </div>
              </div>
              <div className="h-[160px] w-full">
                <TimeSeriesChart data={viewsSeries} format={fmtViews} />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── Connected accounts + Quick actions ──────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Connected Accounts */}
        <section>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight">
            Connected accounts
          </h2>
          {myAccounts.length === 0 ? (
            <div className="rounded-[14px] border border-dashed bg-card px-5 py-8 text-center">
              <p className="text-[14px] text-muted">No accounts connected</p>
              <Link
                href="/clipper/accounts"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:underline"
              >
                Connect account <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="rounded-[14px] border bg-card divide-y divide-border/40">
              {myAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span className="flex items-center gap-2.5">
                    <PlatformIcon p={a.platform} size={16} />
                    <span className="text-[14px] font-medium">{a.handle}</span>
                  </span>
                  <span
                    className={`text-[12px] font-medium ${
                      a.status === "verified" || a.status === "connected"
                        ? "text-green"
                        : a.status === "connecting"
                          ? "text-amber"
                          : "text-muted"
                    }`}
                  >
                    {a.status === "verified"
                      ? "Connected"
                      : a.status === "connected"
                        ? "Connected"
                        : a.status === "connecting"
                          ? "Connecting"
                          : "Not connected"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick actions */}
        <section>
          <h2 className="mb-3 text-[17px] font-bold tracking-tight">
            Quick actions
          </h2>
          <div className="rounded-[14px] border bg-card divide-y divide-border/40">
            <Link
              href="/clipper/campaigns"
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
            >
              <Compass size={16} className="text-muted" />
              <span className="text-[14px] font-medium">Browse campaigns</span>
            </Link>
            <Link
              href="/clipper/wallet"
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
            >
              <BarChart3 size={16} className="text-muted" />
              <span className="text-[14px] font-medium">View earnings</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Metric Card
   ──────────────────────────────────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] border bg-card p-4">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p
        className={`mt-2 font-mono text-[20px] font-bold leading-none tracking-tight ${valueClass ?? ""}`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[11px] text-muted">{sub}</p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Campaign Card
   ──────────────────────────────────────────────────────────────────────────── */

function CampaignCardLarge({
  campaign,
}: {
  campaign: Campaign;
}) {
  const thumb = campaign.thumbnails?.[0];

  return (
    <div className="group flex flex-col overflow-hidden rounded-[14px] border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      {/* Thumbnail */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-accent-soft">
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt={campaign.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon p={campaign.platform} size={28} />
          </div>
        )}
        {/* Platform badge */}
        <div className="absolute left-3 top-3 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-card/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
            <PlatformIcon p={campaign.platform} size={12} />
            {campaign.platform}
          </span>
        </div>
        <Link
          href={`/campaigns/${campaign.id}`}
          aria-label={campaign.title}
          className="absolute inset-0 z-10"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover:underline underline-offset-2">
          {campaign.title}
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          @{campaign.creator}
        </p>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-[18px] font-bold tracking-tight">
            {rup(campaign.payout)}
          </span>
          <span className="text-[11px] text-muted">/ 1K views</span>
        </div>

        <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
          {campaign.budget ? (
            <span>Budget {rup(campaign.budget)}</span>
          ) : (
            <span>Flexible budget</span>
          )}
          {campaign.daysLeft != null && (
            <>
              <span className="text-border">&middot;</span>
              <span>{campaign.daysLeft}d left</span>
            </>
          )}
        </div>

        <div className="flex-1" />

        <div className="mt-4 border-t border-border/50 pt-3">
          <Link
            href={`/campaigns/${campaign.id}`}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-border/60 px-3.5 py-2 text-[12px] font-medium text-foreground transition-colors duration-150 hover:bg-accent-soft"
          >
            View campaign
            <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Empty States
   ──────────────────────────────────────────────────────────────────────────── */

function EmptyCampaigns({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-[14px] border border-dashed bg-card px-6 py-14 text-center">
      <Megaphone className="mx-auto text-muted" size={28} strokeWidth={1.5} />
      <p className="mt-5 text-[17px] font-medium">
        No campaigns available right now
      </p>
      <p className="mt-1.5 text-[13px] text-muted">
        Check back soon or browse all campaigns.
      </p>
      <button
        onClick={onBrowse}
        className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-foreground px-6 py-3 text-[14px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
      >
        Browse campaigns <ArrowRight size={14} />
      </button>
    </div>
  );
}

function EmptySubmissions({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-[14px] border border-dashed bg-card px-6 py-14 text-center">
      <Film className="mx-auto text-muted" size={28} strokeWidth={1.5} />
      <p className="mt-5 text-[17px] font-medium">No clips yet</p>
      <p className="mt-1.5 text-[13px] text-muted">
        Find a campaign and start clipping.
      </p>
      <button
        onClick={onBrowse}
        className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-foreground px-6 py-3 text-[14px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
      >
        Find campaigns <ArrowRight size={14} />
      </button>
    </div>
  );
}
