"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { Campaign, Platform } from "@/lib/types";

function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function derivePlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("instagram")) return "Instagram";
  if (u.includes("youtube") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("tiktok")) return "TikTok";
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
  const [caption, setCaption] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>(campaign.platform);

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

        <label className="mt-4 block text-sm font-medium">Platform</label>
        <div className="mt-1.5 flex gap-2">
          {(["Instagram", "YouTube", "TikTok"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${platform === p ? "border-accent bg-accent-soft" : "text-muted"}`}
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

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            disabled={!videoUrl || !caption}
            onClick={() => onSubmit(caption, videoUrl, platform)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send size={13} /> Submit for review
          </button>
        </div>
      </div>
    </div>
  );
}
