"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
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
  const { clips } = useStore();
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;
  const pct =
    typeof campaign.budget === "number" && campaign.budget > 0
      ? Math.min(100, Math.round(((campaign.spent ?? 0) / campaign.budget) * 100))
      : 0;

  const inner = (
    <>
      <div
        className={`relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br ${
          GRADIENTS[(index ?? 0) % GRADIENTS.length]
        }`}
      >
        <PlatformIcon p={campaign.platform} size={38} />
        <span className="absolute left-3 top-3 rounded-full bg-foreground/10 px-2.5 py-1 text-[11px] font-medium text-foreground/80 backdrop-blur">
          {campaign.platform}
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-500">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {campaign.status === "closed" ? "Closed" : "Open"}
        </span>
      </div>

      <div className="p-5">
        <h3 className="font-semibold leading-tight group-hover:text-foreground">
          {campaign.title}
        </h3>

        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-foreground">
            {campaign.creator?.[0]?.toUpperCase()}
          </span>
          <span className="truncate text-xs text-muted">{campaign.creator}</span>
          {campaign.niche && (
            <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {campaign.niche}
            </span>
          )}
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted">{campaign.brief}</p>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="font-mono text-lg font-semibold text-amber">
              {rup(campaign.payout)}
            </p>
            <p className="text-[11px] text-muted">per 1K views</p>
          </div>
          <div className="flex items-center gap-1 text-sm font-medium">
            <Clock size={13} className="text-muted" />
            {campaign.daysLeft}d left
          </div>
        </div>

        {typeof campaign.budget === "number" && campaign.budget > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>{rup(campaign.spent ?? 0)} spent</span>
              <span>{rup(campaign.budget)} budget</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t px-5 py-3">
        <span className="text-xs text-muted">{clippersIn} clippers joined</span>
        <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition group-hover:opacity-90">
          View campaign
        </span>
      </div>
    </>
  );

  const wrapper =
    "group block cursor-pointer overflow-hidden rounded-2xl border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg";

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
