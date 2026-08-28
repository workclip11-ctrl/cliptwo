"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import type { Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["TikTok", "YouTube", "Instagram", "Reels"];
const NICHES = ["Tech", "Gaming", "Finance", "Comedy", "Fitness", "Podcast"];

export function NewCampaignModal({
  creatorName,
  onClose,
  onSubmit,
}: {
  creatorName: string;
  onClose: () => void;
  onSubmit: (
    title: string,
    brief: string,
    platform: Platform,
    payout: number,
    niche: string,
    budget: number,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [niche, setNiche] = useState(NICHES[0]);
  const [payout, setPayout] = useState("220");
  const [budget, setBudget] = useState("40000");

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">New campaign</h3>
        <p className="mt-1 text-sm text-muted">
          Set your rate and budget — clippers can claim it immediately.
        </p>

        <label className="mt-4 block text-sm font-medium">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Grind Podcast — Ep. 143"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <label className="mt-4 block text-sm font-medium">Brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="What clippers should focus on, format, tone…"
          className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Niche</label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {NICHES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">CPM (₹ / 1K views)</label>
            <input
              type="number"
              min={0}
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Budget (₹)</label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            disabled={!title || !brief}
            onClick={() =>
              onSubmit(
                title,
                brief,
                platform,
                Number(payout) || 0,
                niche,
                Number(budget) || 0,
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <BadgeCheck size={14} /> Fund &amp; launch
          </button>
        </div>
      </div>
    </div>
  );
}
