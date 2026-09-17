"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Image as ImageIcon,
  Megaphone,
  Film,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";
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
  const earnings = fin.total / 100;
  const available = fin.processing / 100;
  const pending = fin.pending / 100;
  const approvedCount = fin.totalCount;
  const pendingCount = fin.pendingCount;
  const verifiedViews = myClips.reduce(
    (s, k) => s + (k.verifiedViews ?? 0),
    0,
  );
  const displayedCampaigns = openCampaigns.slice(0, 3);

  const viewsSeries = seriesByDay(myClips, (k) => k.verifiedViews ?? 0);

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
            Welcome back, @{user?.name ?? user?.email ?? "clipper"} &#x1F44B;
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
            Find campaigns worth clipping and turn views into earnings.
          </p>
        </div>
        <Link
          href="/clipper/campaigns"
          className="group inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98] sm:px-6 sm:py-3 sm:text-[15px]"
        >
          Find campaigns
          <ArrowRight
            size={15}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </section>

      {/* ── Earnings overview — 4 metric cards ──────────── */}
      <section>
        <h2 className="mb-4 text-[18px] font-bold tracking-tight">
          Earnings overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total earnings"
            value={rup(earnings)}
            sub={earnings > 0 ? "from approved clips" : undefined}
          />
          <MetricCard
            label="Available"
            value={rup(available)}
            valueClass={available > 0 ? "text-green" : undefined}
          />
          <MetricCard
            label="Pending"
            value={rup(pending)}
            valueClass={pending > 0 ? "text-amber" : undefined}
          />
          <MetricCard
            label="Approved clips"
            value={String(approvedCount)}
            sub={pendingCount > 0 ? `${pendingCount} awaiting review` : undefined}
          />
        </div>
      </section>

      {/* ── Campaigns worth clipping — 3-col grid ───────── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight">
              Campaigns worth clipping
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Live opportunities with verified budgets.
            </p>
          </div>
          {openCampaigns.length > 0 && (
            <Link
              href="/clipper/campaigns"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
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
                financeRecords={financeRecords}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── My clips + Performance — side by side ───────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* My clips */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[18px] font-bold tracking-tight">My clips</h2>
            {myClips.length > 0 && (
              <Link
                href="/clipper/submissions"
                className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-foreground"
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
                          <ImageIcon size={14} className="text-muted/30" />
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
                          {k.verifiedViews ? fmtViews(k.verifiedViews) : "—"}
                        </p>
                        <p className="text-[10px] text-muted">views</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[13px] font-semibold">
                          {earning > 0 ? rup(earning) : "—"}
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
          <h2 className="mb-4 text-[18px] font-bold tracking-tight">
            Performance
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
                    {rup(earnings)}
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

      {/* ── Connected accounts + Wallet — side by side ──── */}
      <div className="grid gap-8 border-t border-border/60 pt-8 lg:grid-cols-2">
        {/* Connected Accounts */}
        <section>
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">
            Connected accounts
          </h3>
          {myAccounts.length === 0 ? (
            <div className="flex items-center justify-between rounded-[10px] border border-dashed px-4 py-3">
              <span className="text-[13px] text-muted">
                No accounts connected
              </span>
              <Link
                href="/clipper/accounts"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:underline"
              >
                Connect <ArrowRight size={12} />
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              {myAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-[10px] px-3 py-2 transition-colors duration-150 hover:bg-accent-soft/50"
                >
                  <span className="flex items-center gap-2">
                    <PlatformIcon p={a.platform} size={14} />
                    <span className="text-[13px] font-medium">{a.handle}</span>
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
              ))}
              <Link
                href="/clipper/accounts"
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[13px] font-medium transition-colors duration-150 hover:bg-accent-soft"
              >
                Manage accounts <ArrowRight size={11} />
              </Link>
            </div>
          )}
        </section>

        {/* Wallet */}
        <section>
          <h3 className="mb-3 text-[13px] font-semibold text-foreground">
            Wallet
          </h3>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-xl font-bold">{rup(earnings)}</p>
            <span
              className={`text-[11px] font-medium ${earnings > 0 ? "text-green" : "text-muted"}`}
            >
              {earnings > 0 ? "Available" : "No earnings yet"}
            </span>
          </div>
          <Link
            href="/clipper/wallet"
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 text-[13px] font-medium transition-colors duration-150 hover:bg-accent-soft"
          >
            View wallet <ArrowRight size={11} />
          </Link>
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
    <div className="rounded-[14px] border bg-card p-5">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p
        className={`mt-2 font-mono text-[22px] font-bold leading-none tracking-tight ${valueClass ?? ""}`}
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
  financeRecords,
}: {
  campaign: Campaign;
  financeRecords: ReturnType<typeof useStore>["financeRecords"];
}) {
  const { savedCampaigns, toggleSaveCampaign, clips } = useStore();
  const isSaved = savedCampaigns.includes(campaign.id);
  const spent = campaignSpent(campaign, financeRecords);
  const remaining = (campaign.budget ?? 0) - spent;
  const thumb = campaign.thumbnails?.[0];
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[14px] border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
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
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-card/90 px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur">
            <PlatformIcon p={campaign.platform} size={13} />
            {campaign.platform}
          </span>
        </div>
        {/* Save button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSaveCampaign(campaign.id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label={isSaved ? "Unsave campaign" : "Save campaign"}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-card/80 backdrop-blur transition-colors duration-150 hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <HeartIcon saved={isSaved} />
        </button>
        {/* Link overlay */}
        <Link
          href={`/campaigns/${campaign.id}`}
          aria-label={campaign.title}
          className="absolute inset-0 z-10"
        />
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug group-hover:underline underline-offset-2">
          {campaign.title}
        </h3>
        <p className="mt-1 text-[13px] text-muted">by {campaign.creator}</p>

        {/* Payout */}
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-[20px] font-bold tracking-tight">
            {rup(campaign.payout)}
          </span>
          <span className="text-[12px] text-muted">/ 1K views</span>
        </div>

        {/* Secondary metrics */}
        <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
          <span>
            {remaining > 0 ? `${rup(remaining)} left` : "Flexible budget"}
          </span>
          <span className="text-border">&middot;</span>
          <span>{campaign.daysLeft}d left</span>
        </div>

        <div className="flex-1" />

        {/* CTA */}
        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
          <span className="text-[12px] text-muted">
            {clippersIn > 0 ? `${clippersIn} clippers` : "Be the first"}
          </span>
          <Link
            href={`/campaigns/${campaign.id}`}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-2 text-[12px] font-medium text-white transition-all duration-200 group-hover:bg-foreground/90"
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
   Heart Icon
   ──────────────────────────────────────────────────────────────────────────── */

function HeartIcon({ saved }: { saved: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={saved ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={saved ? "text-red" : "text-muted"}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
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
