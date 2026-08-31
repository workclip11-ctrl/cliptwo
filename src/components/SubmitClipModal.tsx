"use client";

import { useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { campaignBudget } from "@/lib/finance";
import { rup } from "@/lib/format";
import type { Campaign, Platform } from "@/lib/types";

function derivePlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("instagram")) return "Instagram";
  if (u.includes("youtube") || u.includes("youtu.be")) return "YouTube";
  return "Instagram";
}

export function SubmitClipModal({
  campaign,
  onClose,
  onSubmit,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSubmit: (caption: string, videoUrl: string, platform: Platform) => void;
}) {
  const { clips } = useStore();
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>(campaign.platform);

  const budget = campaignBudget(campaign, clips);
  const isAtBudget = budget.status === "budget_reached";
  const isNearBudget = budget.status === "near_budget";
  const isDisabled = isAtBudget || !videoUrl || !caption;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">Submit a clip</h3>
        <p className="mt-1 text-sm text-muted">{campaign.title}</p>
        <p className="mt-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-muted">
          You earn{" "}
          <span className="font-mono font-medium text-foreground">
            {rup(campaign.payout)}
          </span>{" "}
          per 1,000 verified views.
        </p>

        {isAtBudget && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red/30 bg-red/5 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
            <div>
              <p className="text-xs font-medium text-red">Campaign budget reached</p>
              <p className="mt-0.5 text-xs text-muted">
                This campaign has reached its budget of {rup(campaign.budget ?? 0)}.
                Submissions are temporarily closed.
              </p>
            </div>
          </div>
        )}

        {isNearBudget && !isAtBudget && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber/30 bg-amber/5 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" />
            <div>
              <p className="text-xs font-medium text-amber">Near budget limit</p>
              <p className="mt-0.5 text-xs text-muted">
                Only {rup(budget.remaining)} remaining. Your clip may be rejected
                if the budget is reached before approval.
              </p>
            </div>
          </div>
        )}

        <label className="mt-4 block text-sm font-medium">Platform</label>
        <div className="mt-1.5 flex gap-2">
          {(["Instagram", "YouTube"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium sm:flex-initial ${platform === p ? "border-accent bg-accent-soft" : "text-muted"}`}
            >
              <PlatformIcon p={p} size={14} /> {p}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium">Video URL</label>
        <input
          value={videoUrl}
          onChange={(e) => {
            setVideoUrl(e.target.value);
            setPlatform(derivePlatform(e.target.value));
          }}
          placeholder="https://"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <label className="mt-4 block text-sm font-medium">Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={3}
          placeholder="Add a hook and hashtags…"
          className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-2.5 text-sm font-medium sm:py-1.5"
          >
            Cancel
          </button>
          <button
            disabled={isDisabled}
            onClick={() => onSubmit(caption, videoUrl, platform)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:py-1.5"
          >
            <Send size={13} /> {isAtBudget ? "Submissions closed" : "Submit for review"}
          </button>
        </div>
      </div>
    </div>
  );
}
