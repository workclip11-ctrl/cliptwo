"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { Campaign } from "@/lib/types";

const GRADIENTS = [
  "from-sky-500/30 to-indigo-500/30",
  "from-rose-500/30 to-orange-500/30",
  "from-emerald-500/30 to-teal-500/30",
  "from-violet-500/30 to-fuchsia-500/30",
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
  const inner = (
    <>
      <div
        className={`relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br ${
          GRADIENTS[(index ?? 0) % GRADIENTS.length]
        }`}
      >
        <PlatformIcon p={campaign.platform} size={32} />
        <span className="absolute left-3 top-3 rounded-full bg-foreground/10 px-2.5 py-1 text-[11px] font-medium text-foreground/80">
          {campaign.platform}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-500">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {campaign.status === "closed" ? "Closed" : "Open"}
        </span>
      </div>

      <div className="p-4">
        <h3 className="font-semibold leading-snug">{campaign.title}</h3>
        <p className="mt-1 text-xs text-muted">
          {campaign.creator}
          {campaign.niche ? ` · ${campaign.niche}` : ""}
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-muted">{campaign.brief}</p>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <div className="text-xs text-muted">
          <span className="font-mono text-sm font-semibold text-amber">
            {rup(campaign.payout)}
          </span>
          <span className="ml-1">/1K</span>
          <span className="ml-2">{campaign.daysLeft}d left</span>
        </div>
        <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          View campaign
        </span>
      </div>
    </>
  );

  const wrapper =
    "group block cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:border-accent/40 hover:shadow-md";

  if (onView) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onView(campaign)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onView(campaign);
        }}
        className={wrapper}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link href={`/campaign/${campaign.id}`} className={wrapper}>
      {inner}
    </Link>
  );
}
