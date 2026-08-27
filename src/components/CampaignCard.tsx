"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
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
  const { clips } = useStore();
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;

  const inner = (
    <>
      <div
        className={`flex h-28 items-center justify-center bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} text-foreground/70`}
      >
        <PlatformIcon p={campaign.platform} size={30} />
      </div>
      <div className="p-4">
        <h3 className="font-semibold leading-tight group-hover:underline underline-offset-2">
          {campaign.title}
        </h3>
        <p className="mt-1 text-xs text-muted">
          {campaign.creator} · {campaign.niche}
        </p>
        <p className="mt-2 line-clamp-2 text-sm text-muted">{campaign.brief}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span className="font-mono text-amber">{rup(campaign.payout)}/1K</span>
          <span>{campaign.daysLeft}d left</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-3">
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
        className="group block cursor-pointer overflow-hidden rounded-2xl border bg-card transition hover:shadow-sm"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/campaign/${campaign.id}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition hover:shadow-sm"
    >
      {inner}
    </Link>
  );
}
