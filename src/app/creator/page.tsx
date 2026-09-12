"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { NewCampaignModal } from "@/components/NewCampaignModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";
import type { Campaign, Clip, Platform } from "@/lib/types";

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
  const outstanding = fin.pending / 100;
  const activeCount = myCampaigns.filter((c) => c.status === "open").length;

  const topClips = [...received]
    .filter((k) => k.status === "approved" || k.status === "held")
    .sort(
      (a, b) =>
        (financeRecords.find((r) => r.clipId === b.id)?.netAmount ?? 0) -
        (financeRecords.find((r) => r.clipId === a.id)?.netAmount ?? 0),
    )
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-5 py-10 sm:px-8">
      {/* ── Header / Action Area ────────────────────────── */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
            {user?.name ?? user?.email ?? "Creator"}
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
            Manage campaigns, review clips, and track spend.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/creator/analytics"
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border bg-card px-5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
          >
            <BarChart3 size={16} /> Analytics
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border bg-card px-5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
          >
            Quick add
          </button>
          <Link
            href="/creator/campaigns/new"
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
          >
            <Plus size={16} /> Create campaign
          </Link>
        </div>
      </section>

      {/* ── Campaign Overview ───────────────────────────── */}
      <section>
        <div className="rounded-[12px] border bg-card px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {/* Dominant: active campaigns */}
            <div>
              <p className="text-[13px] font-medium text-muted">
                Active campaigns
              </p>
              <p className="mt-2 font-mono text-[28px] font-bold leading-none tracking-tight">
                {activeCount}
              </p>
              {activeCount > 0 && (
                <p className="mt-1.5 text-[13px] text-muted">
                  currently running
                </p>
              )}
            </div>

            {/* Supporting metrics */}
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Clips received</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {received.length}
                </p>
              </div>
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Pending review</p>
                <p
                  className={`mt-1 font-mono text-lg font-bold ${pendingCount > 0 ? "text-amber" : ""}`}
                >
                  {pendingCount}
                </p>
              </div>
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Paid out</p>
                <p className="mt-1 font-mono text-lg font-bold text-green">
                  {rup(totalSpent)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent Campaigns + Pending Review ────────────── */}
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Recent campaigns */}
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-[20px] font-bold tracking-tight">
              Recent campaigns
            </h2>
            {myCampaigns.length > 0 && (
              <Link
                href="/creator/campaigns"
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
          <div className="space-y-3">
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
              <div className="rounded-[12px] border border-dashed bg-card py-12 text-center">
                <p className="text-[16px] font-medium">No campaigns yet</p>
                <p className="mt-2 text-[14px] text-muted">
                  Create your first campaign to start receiving clips.
                </p>
                <Link
                  href="/creator/campaigns/new"
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90"
                >
                  <Plus size={16} /> Create campaign
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Pending review */}
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-[20px] font-bold tracking-tight">
              Pending review
            </h2>
            {pending.length > 0 && (
              <Link
                href="/creator/submissions"
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
          <div className="space-y-0 divide-y divide-border/50">
            {pending.slice(0, 5).map((k) => {
              const camp = campaigns.find((c) => c.id === k.campaignId);
              const thumb = camp?.thumbnails?.[0];
              return (
                <Link
                  key={k.id}
                  href={`/clip/${k.id}`}
                  className="group flex items-center gap-3.5 py-3.5 transition-colors duration-150 sm:gap-4"
                >
                  {/* Thumbnail */}
                  <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
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

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium group-hover:underline underline-offset-2">
                      @{k.clipper}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {camp?.title}
                    </p>
                  </div>

                  {/* Platform */}
                  <div className="shrink-0">
                    {k.platform && (
                      <PlatformIcon p={k.platform} size={14} />
                    )}
                  </div>
                </Link>
              );
            })}
            {pending.length === 0 && (
              <div className="rounded-[12px] border border-dashed bg-card py-12 text-center">
                <p className="text-[16px] font-medium">
                  Nothing pending
                </p>
                <p className="mt-2 text-[14px] text-muted">
                  All clips reviewed.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Top Clips / Performance ──────────────────────── */}
      <section>
        <h2 className="mb-5 text-[20px] font-bold tracking-tight">
          Best performing content
        </h2>
        {topClips.length === 0 ? (
          <div className="rounded-[12px] border border-dashed bg-card py-12 text-center">
            <p className="text-[16px] font-medium">No earned clips yet</p>
            <p className="mt-2 text-[14px] text-muted">
              Approved clips will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-border/50">
            {topClips.map((k, i) => {
              const camp = campaigns.find((c) => c.id === k.campaignId);
              const finRec = financeRecords.find((r) => r.clipId === k.id);
              const earned = (finRec?.netAmount ?? 0) / 100;
              const thumb = camp?.thumbnails?.[0];
              return (
                <Link
                  key={k.id}
                  href={`/clip/${k.id}`}
                  className="group flex items-center gap-4 py-3.5 transition-colors duration-150 sm:gap-5"
                >
                  {/* Rank */}
                  <span className="w-5 shrink-0 text-right text-[13px] font-medium text-muted">
                    {i + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
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

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium group-hover:underline underline-offset-2">
                      @{k.clipper}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {camp?.title}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="flex shrink-0 items-center gap-6">
                    <div className="text-right">
                      <p className="font-mono text-[15px] font-bold">
                        {fmtViews(k.verifiedViews ?? 0)}
                      </p>
                      <p className="text-[11px] text-muted">views</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[15px] font-bold">
                        {rup(earned)}
                      </p>
                      <p className="text-[11px] text-muted">earned</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Payout / Spend Summary ───────────────────────── */}
      <section>
        <h2 className="mb-5 text-[20px] font-bold tracking-tight">
          Spend summary
        </h2>
        <div className="rounded-[12px] border bg-card px-6 py-6 sm:px-8">
          <div className="flex flex-wrap gap-x-12 gap-y-6">
            <div>
              <p className="text-[13px] text-muted">Total earned</p>
              <p className="mt-1.5 font-mono text-[20px] font-bold tracking-tight">
                {rup(totalEarned)}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Paid out</p>
              <p className="mt-1.5 font-mono text-[20px] font-bold tracking-tight text-green">
                {rup(totalSpent)}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Outstanding</p>
              <p
                className={`mt-1.5 font-mono text-[20px] font-bold tracking-tight ${outstanding > 0 ? "text-amber" : ""}`}
              >
                {rup(outstanding)}
              </p>
            </div>
          </div>
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
              objective: extra.objective || undefined,
              maxPayoutPerClip: extra.maxPayoutPerClip || undefined,
              recommendedDuration: extra.recommendedDuration || undefined,
              aspectRatio: extra.aspectRatio || undefined,
              cta: extra.cta || undefined,
              hook: extra.hook || undefined,
              branding: extra.branding || undefined,
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
   Campaign Row — compact media/project object
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
  const pct = c.budget
    ? Math.min(100, Math.round((spent / c.budget) * 100))
    : 0;
  const isOpen = c.status === "open";
  const isArchived = c.status === "archived";
  const thumb = c.thumbnails?.[0];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-4 rounded-[12px] border bg-card p-4 text-left transition-all duration-150 hover:border-foreground/12 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:p-5 ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      {/* Thumbnail */}
      <div className="h-[52px] w-[80px] shrink-0 overflow-hidden rounded-lg bg-accent-soft">
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon p={c.platform} size={18} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <p className="truncate text-[15px] font-semibold group-hover:underline underline-offset-2">
            {c.title}
          </p>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
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
        <p className="mt-1 text-[13px] text-muted">
          {c.niche} · {c.platform}
        </p>

        {/* Budget bar */}
        {c.budget ? (
          <div className="mt-2.5">
            <div className="h-[4px] w-full max-w-[200px] overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {campClips.length} clips · {c.daysLeft}d left · {rup(spent)}{" "}
              spent
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-muted">
            {campClips.length} clips · {c.daysLeft}d left
          </p>
        )}
      </div>

      {/* Arrow */}
      <ArrowRight
        size={16}
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
              {campaign.creator} · {campaign.niche} · {campaign.platform}
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
              className="mt-3 h-24 w-40 rounded-lg border object-cover"
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
