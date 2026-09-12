"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { campaignBudget } from "@/lib/finance";
import { rup } from "@/lib/format";
import type { Campaign } from "@/lib/types";

export function CampaignCard({
  campaign,
  index: _index,
  onView,
}: {
  campaign: Campaign;
  index: number;
  onView?: (c: Campaign) => void;
}) {
  const { clips, savedCampaigns, toggleSaveCampaign, financeRecords } =
    useStore();
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;
  const isSaved = savedCampaigns.includes(campaign.id);
  const b = campaignBudget(campaign, financeRecords);
  const remaining = b.remaining;
  const thumb = campaign.thumbnails?.[0];

  const isUrgent = (campaign.daysLeft ?? 99) <= 3;
  const isLowBudget = b.total > 0 && b.utilizationPct > 80;

  const inner = (
    <>
      {/* ── Thumbnail ──────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden bg-accent-soft">
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt={campaign.title}
            className="h-full w-full object-cover transition-transform duration-[220ms] ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon p={campaign.platform} size={28} />
          </div>
        )}

        {/* Single badge — platform/category combined */}
        <div className="absolute left-3 top-3 z-10">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[12px] font-medium text-foreground shadow-sm backdrop-blur">
            <PlatformIcon p={campaign.platform} size={12} />
            {campaign.platform}
            {(campaign.category || campaign.niche) && (
              <>
                <span className="text-border">·</span>
                {campaign.category || campaign.niche}
              </>
            )}
          </span>
        </div>

      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="flex flex-1 flex-col p-5">
        {/* Title + Creator */}
        <h3 className="line-clamp-2 text-[17px] font-semibold leading-[1.3] group-hover:underline underline-offset-2">
          {campaign.title}
        </h3>
        <p className="mt-1.5 text-[14px] text-muted">
          by {campaign.creator}
        </p>

        {/* Payout — dominant */}
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="font-mono text-[22px] font-bold tracking-tight">
            {rup(campaign.payout)}
          </span>
          <span className="text-[13px] text-muted">/ 1K views</span>
        </div>

        {/* Secondary metadata */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className={isLowBudget ? "font-medium text-amber" : ""}>
            {b.total > 0 ? `${rup(remaining)} left` : "Flexible budget"}
          </span>
          <span className="text-border">·</span>
          <span className={isUrgent ? "font-medium text-amber" : ""}>
            {campaign.daysLeft}d left
          </span>
          {campaign.viewRules?.minViews != null &&
            campaign.viewRules.minViews > 0 && (
              <>
                <span className="text-border">·</span>
                <span>
                  Min {campaign.viewRules.minViews.toLocaleString()} views
                </span>
              </>
            )}
        </div>

        {/* Budget bar */}
        {b.total > 0 && (
          <div className="mt-3 h-[4px] w-full overflow-hidden rounded-full bg-accent-soft">
            <div
              className={`h-full rounded-full ${
                b.status === "budget_reached"
                  ? "bg-red"
                  : b.status === "near_budget"
                    ? "bg-amber"
                    : "bg-foreground"
              }`}
              style={{ width: `${Math.min(100, b.utilizationPct)}%` }}
            />
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer: clippers + CTA */}
        <div className="mt-5 flex items-center justify-between border-t border-border/50 pt-4">
          <span className="text-[13px] text-muted">
            {clippersIn > 0 ? `${clippersIn} clippers` : "Be the first"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[14px] font-medium text-white transition-all duration-200 group-hover:bg-foreground/90">
            View campaign
            <ArrowRight size={14} />
          </span>
        </div>
      </div>
    </>
  );

  if (onView) {
    return (
      <article className="group relative flex flex-col overflow-hidden rounded-[12px] border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        {/* Campaign navigation — keyboard accessible, visually covers the card */}
        <button
          type="button"
          onClick={() => onView(campaign)}
          className="absolute inset-0 z-0 cursor-pointer bg-transparent text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          aria-label={`View ${campaign.title}`}
        />
        {/* Save button — independent sibling, sits above the navigation */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSaveCampaign(campaign.id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          title={isSaved ? "Unsave" : "Save"}
          aria-label={isSaved ? "Unsave campaign" : "Save campaign"}
        >
          <HeartIcon saved={isSaved} />
        </button>
        {inner}
      </article>
    );
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[12px] border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      {/* Campaign navigation — keyboard accessible, visually covers the card */}
      <Link
        href={`/campaigns/${campaign.id}`}
        className="absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        aria-label={`View ${campaign.title}`}
      />
      {/* Save button — independent sibling, sits above the navigation */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleSaveCampaign(campaign.id);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur transition-colors duration-150 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        title={isSaved ? "Unsave" : "Save"}
        aria-label={isSaved ? "Unsave campaign" : "Save campaign"}
      >
        <HeartIcon saved={isSaved} />
      </button>
      {inner}
    </article>
  );
}

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
