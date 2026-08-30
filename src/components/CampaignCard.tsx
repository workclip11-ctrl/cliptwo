"use client";

import Link from "next/link";
import { Heart, AlertTriangle } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { campaignBudget } from "@/lib/finance";
import type { Campaign } from "@/lib/types";

const GRADIENTS = [
  "from-sky-500/25 to-indigo-500/25",
  "from-rose-500/25 to-orange-500/25",
  "from-emerald-500/25 to-teal-500/25",
  "from-violet-500/25 to-fuchsia-500/25",
];

function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function CampaignCard({
  campaign,
  index,
  onView,
}: {
  campaign: Campaign;
  index: number;
  onView?: (c: Campaign) => void;
}) {
  const { clips, savedCampaigns, toggleSaveCampaign } = useStore();
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;
  const isSaved = savedCampaigns.includes(campaign.id);
  const b = campaignBudget(campaign, clips);
  const remaining = b.remaining;

  const inner = (
    <>
      <div
        className={`flex h-28 items-center justify-center bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} text-foreground/70 relative`}
      >
        <PlatformIcon p={campaign.platform} size={30} />
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleSaveCampaign(campaign.id);
          }}
          className="absolute top-2 right-2 rounded-full bg-background/80 p-1.5 hover:bg-background"
          title={isSaved ? "Unsave" : "Save"}
        >
          <Heart
            size={16}
            className={isSaved ? "fill-red text-red" : "text-muted"}
          />
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight group-hover:underline underline-offset-2">
            {campaign.title}
          </h3>
          <StatusPill status={campaign.status} />
        </div>
        <p className="mt-1 text-xs text-muted">
          {campaign.creator} · {campaign.category || campaign.niche}
        </p>
        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <PlatformIcon p={campaign.platform} size={12} />
            {campaign.platform}
          </span>
          <span className="font-mono text-amber">{rup(campaign.payout)}/1K</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-1">
            {b.status === "budget_reached" && (
              <AlertTriangle size={11} className="text-red" />
            )}
            {b.status === "near_budget" && (
              <AlertTriangle size={11} className="text-amber" />
            )}
            Budget: {b.total > 0 ? `${rup(remaining)} left` : "Flexible"}
          </span>
          <span>{campaign.daysLeft}d left</span>
        </div>
        {b.total > 0 && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/20">
            <div
              className={`h-full rounded-full ${
                b.status === "budget_reached"
                  ? "bg-red"
                  : b.status === "near_budget"
                    ? "bg-amber"
                    : "bg-accent"
              }`}
              style={{ width: `${Math.min(100, b.utilizationPct)}%` }}
            />
          </div>
        )}
        {campaign.viewRules?.minViews != null && campaign.viewRules.minViews > 0 && (
          <p className="mt-1 text-xs text-muted">
            Min views: {campaign.viewRules.minViews.toLocaleString()}
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between border-t px-4 py-3">
        <span className="text-xs text-muted">{clippersIn} clippers in</span>
        <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          View campaign
        </span>
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
        className="group flex flex-col cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:shadow-sm"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/campaigns/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition hover:shadow-sm"
    >
      {inner}
    </Link>
  );
}
