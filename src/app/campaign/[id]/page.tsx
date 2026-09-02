"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Link2, Film } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { SubmitClipModal } from "@/components/SubmitClipModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";
import type { Platform } from "@/lib/types";

const GRADIENTS = [
  "from-sky-500/25 to-indigo-500/25",
  "from-rose-500/25 to-orange-500/25",
  "from-emerald-500/25 to-teal-500/25",
  "from-violet-500/25 to-fuchsia-500/25",
];
function gradientFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h + ch.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[h];
}

export default function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id as string;
  const { campaigns, clips, addClip, financeRecords } = useStore();
  const { isSignedIn, user } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const isClipper = user?.role === "clipper";

  const campaign = campaigns.find((c) => c.id === id);
  const campClips = clips.filter((k) => k.campaignId === id);
  const clippersIn = new Set(campClips.map((k) => k.clipper)).size;

  function join() {
    if (!isSignedIn) {
      router.push("/login");
      return;
    }
    setActive(true);
  }

  if (!campaign) {
    return (
      <main className="min-h-screen">
        <TopBar />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Campaign not found</h1>
          <p className="mt-2 text-sm text-muted">
            This campaign may have been removed.
          </p>
          <Link
            href="/clipper"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Back to clipper dashboard
          </Link>
        </div>
      </main>
    );
  }

  const spent = campaignSpent(campaign, financeRecords);
  const remaining = (campaign.budget ?? 0) - spent;
  const pct = campaign.budget ? Math.min(100, Math.round((spent / campaign.budget) * 100)) : 0;

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
              else router.push(isClipper ? "/clipper/campaigns" : "/creator");
            }}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft size={14} /> {isClipper ? "Campaigns" : "Creator"}
          </button>
        </div>

        <div
          className={`mt-4 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(campaign.id)} text-foreground/70`}
        >
          <PlatformIcon p={campaign.platform} size={42} />
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
              {campaign.status === "closed" && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-muted">
                  Closed
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              by {campaign.creator} · {campaign.niche} · {campaign.platform}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-medium text-amber">{rup(campaign.payout)}</p>
            <p className="text-[11px] text-muted">per 1K views</p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border bg-card p-4 text-sm text-muted">
          {campaign.brief}
        </p>

        {campaign.sourceLink && (
          <div className="mt-3 rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Video resource</p>
            {/^https?:\/\//i.test(campaign.sourceLink) ? (
              <a
                href={campaign.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-2"
              >
                <Film size={14} /> Open source video
              </a>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
                <Film size={14} /> {campaign.sourceLink}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Budget</p>
            <p className="mt-1 font-mono text-lg font-medium">{rup(campaign.budget ?? 0)}</p>
            <p className="text-[11px] text-muted">{rup(remaining)} left</p>
            <p className="text-[11px] text-muted">{rup(spent)} paid out</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Clippers in</p>
            <p className="mt-1 font-mono text-lg font-medium">{clippersIn}</p>
            <p className="text-[11px] text-muted">{campClips.length} submissions</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted">Time left</p>
            <p className="mt-1 font-mono text-lg font-medium">{campaign.daysLeft}d</p>
            <p className="text-[11px] text-muted">to join</p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border bg-card p-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
            <span>{rup(spent)} spent</span>
            <span>{rup(remaining)} left</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {(campaign.sourceLink || campaign.rules) && (
          <div className="mt-3 space-y-3">
            {campaign.sourceLink && (
              <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm">
                <Link2 size={15} className="shrink-0 text-muted" />
                <span className="shrink-0 text-muted">Source footage:</span>
                <a
                  href={campaign.sourceLink}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-xs text-foreground hover:underline"
                >
                  {campaign.sourceLink}
                </a>
              </div>
            )}
            {campaign.rules && (
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rules</p>
                <p className="mt-1.5 text-sm text-muted">{campaign.rules}</p>
              </div>
            )}
          </div>
        )}

        {campaign.status === "open" && isClipper && (
          <button
            onClick={join}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={15} /> Submit a clip
          </button>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Submissions
          </h2>
          <div className="space-y-3">
            {campClips.map((k) => (
              <div key={k.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/clip/${k.id}`}
                      className="font-medium hover:underline underline-offset-2"
                    >
                      @{k.clipper}
                    </Link>
                    <p className="truncate text-xs text-muted">{k.caption}</p>
                    <p className="mt-1 text-xs text-muted">
                      {fmtViews(k.views)} views · {clipEarnings(k, campaigns) ? rup(clipEarnings(k, campaigns)) : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={k.status} />
                  </div>
                </div>
              </div>
            ))}
            {campClips.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                No clips submitted yet.
              </p>
            )}
          </div>
        </section>
      </div>

      {active && (
        <SubmitClipModal
          campaign={campaign}
          onClose={() => setActive(false)}
          onSubmit={(caption, videoUrl, platform: Platform) => {
            addClip({
              campaignId: campaign.id,
              clipper: user?.name ?? user?.email ?? "clipper",
              caption,
              videoUrl,
              platform,
            });
            setActive(false);
          }}
        />
      )}
    </main>
  );
}
