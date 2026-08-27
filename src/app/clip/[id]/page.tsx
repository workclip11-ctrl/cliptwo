"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Ban, ExternalLink } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import type { Campaign, Clip } from "@/lib/types";

function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function fmtViews(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  if (clip.status !== "approved") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  return camp ? (clip.views / 1000) * camp.payout : 0;
}

export default function ClipDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const { campaigns, clips, setClipStatus } = useStore();
  const [justActed, setJustActed] = useState<Clip["status"] | null>(null);

  const clip = clips.find((k) => k.id === id);

  if (!clip) {
    return (
      <main className="min-h-screen">
        <TopBar active="creator" />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Clip not found</h1>
          <Link
            href="/creator"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Back to creator dashboard
          </Link>
        </div>
      </main>
    );
  }

  const camp = campaigns.find((c) => c.id === clip.campaignId);
  const earnings = clipEarnings(clip, campaigns);

  return (
    <main className="min-h-screen">
      <TopBar active="creator" />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Link href="/creator" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft size={14} /> Creator
          </Link>
          <span>/</span>
          <Link href="/clipper" className="hover:text-foreground">
            Clipper
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clip by @{clip.clipper}</h1>
            <Link
              href={`/campaign/${clip.campaignId}`}
              className="mt-1 inline-block text-sm text-muted hover:text-foreground hover:underline underline-offset-2"
            >
              {camp?.title ?? "Campaign"}
            </Link>
          </div>
          <StatusPill status={clip.status} />
        </div>

        <div className="mt-4 rounded-xl border bg-card p-4">
          <p className="text-sm">{clip.caption}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <PlatformIcon p={clip.platform ?? "Instagram"} size={15} />
            <a
              href={clip.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground"
            >
              {clip.videoUrl} <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Views</p>
            <p className="mt-1 font-mono text-xl font-medium">
              {clip.views ? fmtViews(clip.views) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">CPM</p>
            <p className="mt-1 font-mono text-xl font-medium text-amber">
              {camp ? rup(camp.payout) : "—"}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Earnings</p>
            <p className="mt-1 font-mono text-xl font-medium">
              {earnings ? rup(earnings) : "—"}
            </p>
          </div>
        </div>

        {clip.status === "pending" && (
          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={() => {
                setClipStatus(clip.id, "approved");
                setJustActed("approved");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green/10 px-4 py-2 text-sm font-medium text-green"
            >
              <Check size={15} /> Approve
            </button>
            <button
              onClick={() => {
                setClipStatus(clip.id, "rejected");
                setJustActed("rejected");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red/10 px-4 py-2 text-sm font-medium text-red"
            >
              <Ban size={15} /> Reject
            </button>
            {justActed && (
              <span className="text-xs text-muted">
                Clip {justActed}. Status updates live.
              </span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
