"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { NewCampaignModal } from "@/components/NewCampaignModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";
import type { Platform } from "@/lib/types";

export default function CreatorCampaignsPage() {
  const { campaigns, clips, addCampaign, closeCampaign } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your active and past campaigns.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} /> New campaign
        </button>
      </div>

      <div className="space-y-4">
        {myCampaigns.map((c) => {
          const campClips = clips.filter((k) => k.campaignId === c.id);
          const approvedN = campClips.filter((k) => k.status === "approved").length;
          const pendingN = campClips.filter((k) => k.status === "pending").length;
          const spent = campaignSpent(c, clips);
          const pct = c.budget ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
          const remaining = (c.budget ?? 0) - spent;
          return (
            <div key={c.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/campaign/${c.id}`}
                      className="font-semibold hover:underline underline-offset-2"
                    >
                      {c.title}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                        c.status === "open"
                          ? "border-green/20 bg-green/10 text-green"
                          : "border-muted/20 bg-accent-soft text-muted"
                      }`}
                    >
                      {c.status === "open" ? "Open" : "Closed"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {c.creator} · {c.niche} · {c.platform}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-medium text-amber">
                    {rup(c.payout)}
                  </p>
                  <p className="text-[11px] text-muted">per 1K views</p>
                </div>
              </div>

              <p className="mt-3 text-sm text-muted">{c.brief}</p>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                  <span>{rup(spent)} spent</span>
                  <span>{rup(remaining)} left</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={13} /> {campClips.length} clips
                  </span>
                  <span className="text-green">● {approvedN} approved</span>
                  <span className="text-amber">● {pendingN} pending</span>
                  <span className="inline-flex items-center gap-1">
                    <Sparkles size={12} /> {c.daysLeft} days left
                  </span>
                </div>
                {c.status === "open" && (
                  <button
                    onClick={() => closeCampaign(c.id)}
                    className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
                  >
                    Close campaign
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {myCampaigns.length === 0 && (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted">
            No campaigns yet. Create one to start receiving clips.
          </p>
        )}
      </div>

      {open && (
        <NewCampaignModal
          creatorName={user?.name ?? user?.email ?? "Creator"}
          onClose={() => setOpen(false)}
          onSubmit={(title, brief, platform, payout, niche, budget, sourceLink) => {
            addCampaign({
              title,
              creator: user?.name ?? user?.email ?? "Creator",
              brief,
              platform: platform as Platform,
              payout,
              niche,
              budget,
              sourceLink: sourceLink || undefined,
              spent: 0,
              daysLeft: 30,
            });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
