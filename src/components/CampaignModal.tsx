"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ExternalLink, ArrowUpRight } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { SubmitClipModal } from "@/components/SubmitClipModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import type { Campaign } from "@/lib/types";

const GRADIENTS = [
  "from-sky-500/25 to-indigo-500/25",
  "from-rose-500/25 to-orange-500/25",
  "from-emerald-500/25 to-teal-500/25",
  "from-violet-500/25 to-fuchsia-500/25",
];

export function CampaignModal({
  campaign,
  onClose,
}: {
  campaign: Campaign | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { isSignedIn, user } = useAuth();
  const { campaigns, clips, addClip } = useStore();
  const [submitOpen, setSubmitOpen] = useState(false);

  if (!campaign) return null;

  const index = Math.max(0, campaigns.findIndex((c) => c.id === campaign.id));
  const clippersIn = new Set(
    clips.filter((k) => k.campaignId === campaign.id).map((k) => k.clipper),
  ).size;

  return (
    <div
      className="fixed inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`relative flex h-36 items-center justify-center bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]} text-foreground/70`}
        >
          <PlatformIcon p={campaign.platform} size={40} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 rounded-lg border bg-background/70 p-1.5 text-foreground/70 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold leading-tight">{campaign.title}</h3>
              <p className="mt-1 text-xs text-muted">
                {campaign.creator} · {campaign.niche}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
              {rup(campaign.payout)}/1K views
            </span>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted">{campaign.brief}</p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border bg-background p-3">
              <p className="font-mono text-sm font-medium">{campaign.daysLeft}d</p>
              <p className="text-xs text-muted">left</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="font-mono text-sm font-medium">{clippersIn}</p>
              <p className="text-xs text-muted">clippers in</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="font-mono text-sm font-medium">{campaign.platform}</p>
              <p className="text-xs text-muted">platform</p>
            </div>
          </div>

          {campaign.sourceLink && (
            <a
              href={campaign.sourceLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <ExternalLink size={14} /> Watch the source video
            </a>
          )}

          {campaign.rules && (
            <div className="mt-4">
              <p className="text-sm font-medium">Rules to follow</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{campaign.rules}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <button
            onClick={() => {
              onClose();
              router.push(`/campaigns/${campaign.id}`);
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
          >
            Open full page <ArrowUpRight size={14} />
          </button>
          <button
            onClick={() => {
              if (!isSignedIn) {
                onClose();
                router.push("/login");
                return;
              }
              setSubmitOpen(true);
            }}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Join campaign
          </button>
        </div>
      </div>

      {submitOpen && (
        <SubmitClipModal
          campaign={campaign}
          onClose={() => setSubmitOpen(false)}
          onSubmit={async (caption, videoUrl, platform) => {
            try {
              await addClip({
                campaignId: campaign.id,
                clipper: user?.name ?? user?.email ?? "clipper",
                caption,
                videoUrl,
                platform,
              });
              setSubmitOpen(false);
              onClose();
            } catch {
              // Error handled by store.lastError — keep modal open
            }
          }}
        />
      )}
    </div>
  );
}
