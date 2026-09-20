"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowRight,
  BarChart3,
  Wallet,
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { NewCampaignModal } from "@/components/NewCampaignModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";
import { seriesByDay } from "@/lib/analytics";
import type { Campaign, Clip, Platform } from "@/lib/types";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CreatorPage() {
  const { campaigns, clips, addCampaign, financeRecords } = useStore();
  const { user } = useAuth();
  useAutoRefresh();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const fin = financeOf(financeRecords, (r) => myCampaignIds.has(r.campaignId));
  const pending = received.filter((k) => k.status === "pending");
  const pendingCount = fin.pendingCount;
  const totalSpent = fin.paid / 100;
  const totalEarned = fin.total / 100;
  const totalViews = received.reduce(
    (s, k) => s + (k.verifiedViews ?? 0),
    0,
  );
  const avgCPM =
    totalViews > 0 && totalEarned > 0
      ? totalEarned / (totalViews / 1000)
      : 0;

  const topClips = [...received]
    .filter((k) => k.status === "approved" || k.status === "held")
    .sort(
      (a, b) =>
        (financeRecords.find((r) => r.clipId === b.id)?.netAmount ?? 0) -
        (financeRecords.find((r) => r.clipId === a.id)?.netAmount ?? 0),
    )
    .slice(0, 5);

  const spendSeries = seriesByDay(
    received.filter((k) => k.status === "approved"),
    (k) => {
      const rec = financeRecords.find((r) => r.clipId === k.id);
      return (rec?.netAmount ?? 0) / 100;
    },
  );

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Welcome ─────────────────────────────────────── */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
            Welcome back, {user?.name ?? user?.email ?? "Creator"}! &#x1F680;
          </h1>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">
            Track your campaigns and see how your content is performing.
          </p>
        </div>
        <Link
          href="/creator/campaigns/new"
          className="group inline-flex items-center gap-2 rounded-[10px] bg-foreground px-5 py-2.5 text-[14px] font-medium text-white transition-all duration-200 hover:bg-foreground/90 active:scale-[0.98]"
        >
          <Plus size={16} />
          Create campaign
        </Link>
      </section>

      {/* ── Campaign overview ───────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[17px] font-bold tracking-tight">
          Campaign overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total Spend"
            value={rup(totalSpent)}
            sub="across all campaigns"
          />
          <MetricCard
            label="Total Clips"
            value={String(received.length)}
            sub={`${pendingCount} pending review`}
          />
          <MetricCard
            label="Total Views"
            value={fmtViews(totalViews)}
          />
          <MetricCard
            label="Avg. CPM"
            value={avgCPM > 0 ? rup(avgCPM) : "\u2014"}
          />
        </div>
      </section>

      {/* ── Recent campaigns + Pending review ───────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent campaigns */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              Recent campaigns
            </h2>
            {myCampaigns.length > 0 && (
              <Link
                href="/creator/campaigns"
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
          <div className="space-y-0 divide-y divide-border/50 rounded-[14px] border bg-card">
            {myCampaigns.slice(0, 4).map((c) => (
              <CampaignRow
                key={c.id}
                c={c}
                clips={clips}
                financeRecords={financeRecords}
                onOpen={() => setSelected(c)}
              />
            ))}
            {myCampaigns.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-[15px] font-medium">No campaigns yet</p>
                <p className="mt-1.5 text-[13px] text-muted">
                  Create your first campaign to start receiving clips.
                </p>
                <Link
                  href="/creator/campaigns/new"
                  className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-foreground px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-foreground/90"
                >
                  <Plus size={14} /> Create campaign
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Pending review */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              Pending review
            </h2>
            {pending.length > 0 && (
              <Link
                href="/creator/submissions"
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
          <div className="space-y-0 divide-y divide-border/50 rounded-[14px] border bg-card">
            {pending.slice(0, 5).map((k) => {
              const camp = campaigns.find((c) => c.id === k.campaignId);
              const thumb = camp?.thumbnails?.[0];
              return (
                <Link
                  key={k.id}
                  href={`/clip/${k.id}`}
                  className="group flex items-center gap-3.5 px-4 py-3 transition-colors duration-150"
                >
                  <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[8px] bg-accent-soft">
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
                          size={12}
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium group-hover:underline underline-offset-2">
                      @{k.clipper}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {camp?.title}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-muted">
                      {timeAgo(k.submittedAt)}
                    </span>
                    {k.platform && (
                      <PlatformIcon p={k.platform} size={12} />
                    )}
                  </div>
                </Link>
              );
            })}
            {pending.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-[15px] font-medium">Nothing pending</p>
                <p className="mt-1.5 text-[13px] text-muted">
                  All clips reviewed.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Best performing + Spend summary ─────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Best performing content */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              Best performing content
            </h2>
            {topClips.length > 0 && (
              <Link
                href="/creator/analytics"
                className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
              >
                View all analytics
                <ArrowRight
                  size={13}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            )}
          </div>
          {topClips.length === 0 ? (
            <div className="rounded-[14px] border border-dashed bg-card py-12 text-center">
              <p className="text-[15px] font-medium">No earned clips yet</p>
              <p className="mt-1.5 text-[13px] text-muted">
                Approved clips will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-border/50 rounded-[14px] border bg-card">
              {topClips.map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                const finRec = financeRecords.find((r) => r.clipId === k.id);
                const earned = (finRec?.netAmount ?? 0) / 100;
                const thumb = camp?.thumbnails?.[0];
                return (
                  <Link
                    key={k.id}
                    href={`/clip/${k.id}`}
                    className="group flex items-center gap-3.5 px-4 py-3 transition-colors duration-150"
                  >
                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[8px] bg-accent-soft">
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
                            size={12}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium group-hover:underline underline-offset-2">
                        @{k.clipper}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {fmtViews(k.verifiedViews ?? 0)} views
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[13px] font-bold">
                        {rup(earned)}
                      </p>
                      <p className="text-[10px] text-muted">earned</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Spend summary */}
        <section>
          <h2 className="mb-4 text-[17px] font-bold tracking-tight">
            Spend summary
          </h2>
          <div className="rounded-[14px] border bg-card p-5">
            <div className="mb-1 text-[12px] text-muted">Total spent</div>
            <div className="font-mono text-[22px] font-bold tracking-tight">
              {rup(totalSpent)}
            </div>

            {spendSeries.length > 0 ? (
              <div className="mt-5">
                <SpendBarChart data={spendSeries} />
              </div>
            ) : (
              <div className="mt-5 flex h-[100px] items-center justify-center rounded-[10px] border border-dashed text-[13px] text-muted">
                No spend data yet
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Quick actions ───────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-[17px] font-bold tracking-tight">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            href="/creator/campaigns/new"
            className="flex items-center gap-3 rounded-[14px] border bg-card px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
          >
            <Plus size={16} className="text-muted" />
            <span className="text-[13px] font-medium">Create campaign</span>
          </Link>
          <Link
            href="/creator/analytics"
            className="flex items-center gap-3 rounded-[14px] border bg-card px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
          >
            <BarChart3 size={16} className="text-muted" />
            <span className="text-[13px] font-medium">View analytics</span>
          </Link>
          <Link
            href="/creator/campaigns"
            className="flex items-center gap-3 rounded-[14px] border bg-card px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
          >
            <BarChart3 size={16} className="text-muted" />
            <span className="text-[13px] font-medium">Manage budget</span>
          </Link>
          <Link
            href="/creator/wallet"
            className="flex items-center gap-3 rounded-[14px] border bg-card px-4 py-3.5 transition-colors hover:bg-accent-soft/50"
          >
            <Wallet size={16} className="text-muted" />
            <span className="text-[13px] font-medium">Payouts</span>
          </Link>
        </div>
      </section>

      {/* ── Modals ──────────────────────────────────────── */}
      {open && (
        <NewCampaignModal
          onClose={() => setOpen(false)}
          onSubmit={(
            title,
            brief,
            platform,
            payout,
            niche,
            budget,
            sourceLink,
            extra,
          ) => {
            addCampaign({
              title,
              creator: user?.name ?? user?.email ?? "Creator",
              created_by: user?.id,
              brief,
              platform: platform as Platform,
              payout,
              niche,
              budget,
              sourceLink: sourceLink || undefined,
              spent: 0,
              daysLeft: 30,
              category: niche,
              platforms: extra.platforms,
              maxPayoutPerClip: extra.maxPayoutPerClip || undefined,
              recommendedDuration: extra.recommendedDuration || undefined,
              startDate: new Date().toISOString().slice(0, 10),
              endDate: new Date(Date.now() + 30 * 864e5)
                .toISOString()
                .slice(0, 10),
            });
            setOpen(false);
          }}
        />
      )}

      {selected && (
        <CampaignDetailModal
          campaign={selected}
          clips={clips}
          financeRecords={financeRecords}
          onClose={() => setSelected(null)}
        />
      )}
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
   Spend Bar Chart (SVG)
   ──────────────────────────────────────────────────────────────────────────── */

function SpendBarChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.max(4, Math.floor(400 / data.length) - 2);

  return (
    <div>
      <svg
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        className="h-[100px] w-full"
        role="img"
        aria-label="Spend chart"
      >
        {data.map((d, i) => {
          const barH = (d.value / max) * 80;
          const x = i * (barW + 2);
          const y = 100 - barH;
          return (
            <rect
              key={d.label}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={2}
              className="fill-foreground/15"
            />
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Campaign Row
   ──────────────────────────────────────────────────────────────────────────── */

function CampaignRow({
  c,
  clips,
  financeRecords,
  onOpen,
}: {
  c: Campaign;
  clips: Clip[];
  financeRecords: import("@/lib/types").FinanceRecord[];
  onOpen: () => void;
}) {
  const campClips = clips.filter((k) => k.campaignId === c.id);
  const spent = campaignSpent(c, financeRecords);
  const isOpen = c.status === "open";
  const isArchived = c.status === "archived";
  const thumb = c.thumbnails?.[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent-soft/30 ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[8px] bg-accent-soft">
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon p={c.platform} size={14} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-medium group-hover:underline underline-offset-2">
            {c.title}
          </p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              isArchived
                ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                : isOpen
                  ? "border-green/20 bg-green/10 text-green"
                  : "border-muted/20 bg-accent-soft text-muted"
            }`}
          >
            {isArchived ? "Archived" : isOpen ? "Open" : "Closed"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          {campClips.length} clips &middot; {rup(spent)} spent
        </p>
      </div>

      <ArrowRight
        size={14}
        className="shrink-0 text-muted/40 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-muted"
      />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Campaign Detail Modal
   ──────────────────────────────────────────────────────────────────────────── */

function CampaignDetailModal({
  campaign,
  clips,
  financeRecords,
  onClose,
}: {
  campaign: Campaign;
  clips: Clip[];
  financeRecords: import("@/lib/types").FinanceRecord[];
  onClose: () => void;
}) {
  const campClips = clips.filter((k) => k.campaignId === campaign.id);
  const approvedN = campClips.filter((k) => k.status === "approved").length;
  const pendingN = campClips.filter((k) => k.status === "pending").length;
  const spent = campaignSpent(campaign, financeRecords);
  const pct = campaign.budget
    ? Math.min(100, Math.round((spent / campaign.budget) * 100))
    : 0;
  const remaining = (campaign.budget ?? 0) - spent;
  const isOpen = campaign.status === "open";

  return (
    <div
      className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-6 pb-0">
          <div className="min-w-0">
            <h3 className="text-[18px] font-semibold">{campaign.title}</h3>
            <p className="mt-0.5 text-[13px] text-muted">
              {campaign.creator} &middot; {campaign.niche} &middot;{" "}
              {campaign.platform}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${
              isOpen
                ? "border-green/20 bg-green/10 text-green"
                : "border-muted/20 bg-accent-soft text-muted"
            }`}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {campaign.thumbnails?.[0] && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={campaign.thumbnails[0]}
              alt=""
              className="mt-3 h-24 w-40 rounded-[10px] border object-cover"
            />
          )}

          <p className="mt-3 text-[14px] text-muted">{campaign.brief}</p>

          {campaign.sourceLink && (
            <div className="mt-4">
              <p className="text-[13px] text-muted">Video resource</p>
              {/^https?:\/\//i.test(campaign.sourceLink) ? (
                <a
                  href={campaign.sourceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent hover:underline underline-offset-2"
                >
                  Open source video
                </a>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1.5 text-[14px] text-muted">
                  {campaign.sourceLink}
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[12px] text-muted">
              <span>{rup(spent)} spent</span>
              <span>{rup(remaining)} left</span>
            </div>
            <div className="h-[4px] w-full overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <span>{campClips.length} clips</span>
            <span className="text-green">{approvedN} approved</span>
            <span className="text-amber">{pendingN} pending</span>
            <span>{campaign.daysLeft} days left</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="flex h-11 w-full shrink-0 items-center justify-center rounded-b-2xl border-t bg-card text-[14px] font-medium transition-colors duration-150 hover:bg-accent-soft"
        >
          Close
        </button>
      </div>
    </div>
  );
}
