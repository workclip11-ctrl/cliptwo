"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, BadgeCheck } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";

export default function ClipDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const { campaigns, clips } = useStore();
  const { user } = useAuth();
  const isClipper = user?.role === "clipper";
  const isAdmin = user?.role === "admin";
  const home = isAdmin ? "/admin" : isClipper ? "/clipper" : "/creator";
  const router = useRouter();

  const clip = clips.find((k) => k.id === id);

  if (!clip) {
    return (
      <main className="min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Clip not found</h1>
          <Link
            href={home}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const camp = campaigns.find((c) => c.id === clip.campaignId);
  const earnings = clipEarnings(clip, campaigns);
  const campHref = isClipper ? `/campaigns/${clip.campaignId}` : `/campaign/${clip.campaignId}`;

  return (
    <main className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center gap-3 text-sm text-muted">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1)
                router.back();
              else router.push(home);
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft size={14} /> {isClipper ? "Clipper" : "Creator"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clip by @{clip.clipper}</h1>
            <Link
              href={campHref}
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
          <p className="mt-6 text-sm text-muted">
            Awaiting admin review — status will update once our team approves or
            rejects this clip.
          </p>
        )}
        {clip.status === "rejected" && (
          <p className="mt-6 rounded-lg bg-red/10 px-3 py-2 text-sm text-red">
            This clip was rejected and won&apos;t earn. Submit a new cut for the same campaign if you&apos;d like to try again.
          </p>
        )}
        {clip.status === "held" && (
          <p className="mt-6 text-sm text-muted">
            This clip is currently held and under review.
          </p>
        )}
      </div>
    </main>
  );
}
