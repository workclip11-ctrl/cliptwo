"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusPill } from "@/components/StatusPill";
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
  const { clips, savedCampaigns, toggleSaveCampaign, financeRecords } = useStore();
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
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-accent-soft">
        {thumb ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt={campaign.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlatformIcon p={campaign.platform} size={28} />
          </div>
        )}
        {/* Badges */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-[3px] text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
            <PlatformIcon p={campaign.platform} size={10} />
            {campaign.platform}
          </span>
          {(campaign.category || campaign.niche) && (
            <span className="rounded-md bg-white/90 px-2 py-[3px] text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
              {campaign.category || campaign.niche}
            </span>
          )}
        </div>
        {/* Save */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleSaveCampaign(campaign.id);
          }}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 backdrop-blur transition-colors duration-150 hover:bg-white"
          title={isSaved ? "Unsave" : "Save"}
        >
          <Heart
            size={14}
            className={isSaved ? "fill-red text-red" : "text-muted"}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3.5">
        {/* Title + creator */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-[13px] font-bold leading-snug group-hover:underline underline-offset-2">
              {campaign.title}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted">
              by {campaign.creator}
            </p>
          </div>
          <StatusPill status={campaign.status} />
        </div>

        {/* CPM — dominant metric */}
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-lg font-bold tracking-tight">
            {rup(campaign.payout)}
          </span>
          <span className="text-[11px] text-muted">/ 1K views</span>
        </div>

        {/* Secondary metrics */}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
          <span className={isLowBudget ? "font-medium text-amber" : ""}>
            {b.total > 0 ? `${rup(remaining)} left` : "Flexible budget"}
          </span>
          <span className="text-border">·</span>
          <span className={isUrgent ? "font-medium text-amber" : ""}>
            {campaign.daysLeft}d left
          </span>
          {campaign.viewRules?.minViews != null && campaign.viewRules.minViews > 0 && (
            <>
              <span className="text-border">·</span>
              <span>Min {campaign.viewRules.minViews.toLocaleString()} views</span>
            </>
          )}
        </div>

        {/* Budget bar */}
        {b.total > 0 && (
          <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-accent-soft">
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

        {/* CTA row */}
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
          <span className="text-[11px] text-muted">
            {clippersIn > 0 ? `${clippersIn} clippers` : "Be the first"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-all duration-200 group-hover:bg-foreground/90">
            View campaign
          </span>
        </div>
      </div>
    </>
  );

  if (onView) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onView(campaign)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onView(campaign);
        }}
        className="group flex flex-col cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 hover:border-foreground/12 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
    >
      {inner}
    </Link>
  );
}
