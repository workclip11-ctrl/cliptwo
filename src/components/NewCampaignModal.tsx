"use client";

import { useState } from "react";
import { BadgeCheck, Upload, Film } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["YouTube", "Instagram", "Kick"];
const NICHES = ["Tech", "Gaming", "Finance", "Comedy", "Fitness", "Podcast"];

export interface NewCampaignExtra {
  platforms: Platform[];
  objective: string;
  maxPayoutPerClip: number;
  recommendedDuration: string;
  aspectRatio: string;
  cta: string;
  hook: string;
  branding: string;
}

export function NewCampaignModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    title: string,
    brief: string,
    platform: Platform,
    payout: number,
    niche: string,
    budget: number,
    sourceLink: string,
    extra: NewCampaignExtra,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [platforms, setPlatforms] = useState<Platform[]>(["Instagram"]);
  const [niche, setNiche] = useState(NICHES[0]);
  const [payout, setPayout] = useState("220");
  const [budget, setBudget] = useState("40000");
  const [sourceLink, setSourceLink] = useState("");
  const [fileName, setFileName] = useState("");

  const [objective, setObjective] = useState("");
  const [maxPayout, setMaxPayout] = useState("");
  const [duration, setDuration] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16 vertical");
  const [cta, setCta] = useState("");
  const [hook, setHook] = useState("");
  const [branding, setBranding] = useState("");

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) {
      setFileName(f.name);
      if (!sourceLink) setSourceLink(f.name);
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-card p-6"
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
            <label className="block text-sm font-medium">Primary platform</label>
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

        <div className="mt-4">
          <label className="block text-sm font-medium">Supported platforms</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${platforms.includes(p) ? "border-accent bg-accent-soft" : "text-muted"}`}
              >
                <PlatformIcon p={p} size={13} /> {p}
              </button>
            ))}
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

        <div className="mt-4">
          <label className="block text-sm font-medium">Max payout / clip (₹)</label>
          <input
            type="number"
            min={0}
            value={maxPayout}
            onChange={(e) => setMaxPayout(e.target.value)}
            placeholder="Optional cap"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
        </div>

        <label className="mt-4 block text-sm font-medium">Objective</label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={2}
          placeholder="What you want from the clips…"
          className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        {/* Creative brief */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Clip duration</label>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 15–30s"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Aspect ratio</label>
            <input
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              placeholder="9:16 vertical"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
        </div>
        <label className="mt-4 block text-sm font-medium">Hook requirement</label>
        <input
          value={hook}
          onChange={(e) => setHook(e.target.value)}
          placeholder="Lead with…"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <label className="mt-4 block text-sm font-medium">CTA</label>
        <input
          value={cta}
          onChange={(e) => setCta(e.target.value)}
          placeholder="Link in bio…"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <label className="mt-4 block text-sm font-medium">Branding</label>
        <input
          value={branding}
          onChange={(e) => setBranding(e.target.value)}
          placeholder="Logo in last 2s…"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        {/* Video resource */}
        <div className="mt-4">
          <label className="block text-sm font-medium">Video resource</label>
          <p className="text-xs text-muted">
            The source video clippers will cut from (URL or upload).
          </p>
          <input
            value={sourceLink}
            onChange={(e) => setSourceLink(e.target.value)}
            placeholder="https://youtube.com/watch?v=… or drive link"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
          <div className="mt-2 flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft">
              <Upload size={14} /> Upload video
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFile}
              />
            </label>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              <Film size={13} />
              {fileName || "No file chosen"}
            </span>
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
                sourceLink,
                {
                  platforms,
                  objective,
                  maxPayoutPerClip: Number(maxPayout) || 0,
                  recommendedDuration: duration,
                  aspectRatio,
                  cta,
                  hook,
                  branding,
                },
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
