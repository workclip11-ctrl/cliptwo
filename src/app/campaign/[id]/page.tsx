"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Film } from "lucide-react";
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
        <div className="flex items-center gap-3 text-[13px] text-muted">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1)
                router.back();
              else router.push(isClipper ? "/clipper/campaigns" : "/creator");
            }}
            className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
          >
            <ArrowLeft size={14} /> {isClipper ? "Campaigns" : "Creator"}
          </button>
        </div>

        {/* Thumbnail */}
        <div className="mt-6 aspect-video w-full overflow-hidden rounded-xl bg-accent-soft">
          {campaign.thumbnails?.[0] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={campaign.thumbnails[0]}
              alt={campaign.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className={`flex h-full items-center justify-center bg-gradient-to-br ${gradientFor(campaign.id)}`}>
              <PlatformIcon p={campaign.platform} size={42} />
            </div>
          )}
        </div>

        {/* Title + payout */}
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-[28px] font-bold tracking-tight leading-tight">{campaign.title}</h1>
              {campaign.status === "closed" && (
                <StatusPill status={campaign.status} />
              )}
            </div>
            <p className="mt-1.5 text-[14px] text-muted">
              by {campaign.creator} · {campaign.niche} · {campaign.platform}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[28px] font-bold tracking-tight">{rup(campaign.payout)}</p>
            <p className="text-[12px] text-muted">per 1K views</p>
          </div>
        </div>

        {/* Brief */}
        {campaign.brief && (
          <p className="mt-5 rounded-xl border bg-card p-5 text-[14px] leading-relaxed text-muted">
            {campaign.brief}
          </p>
        )}

        {/* Source link */}
        {campaign.sourceLink && (
          <div className="mt-3 rounded-xl border bg-card p-4">
            <p className="text-[12px] text-muted">Video resource</p>
            {/^https?:\/\//i.test(campaign.sourceLink) ? (
              <a
                href={campaign.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] font-medium text-foreground hover:underline underline-offset-2"
              >
                <Film size={14} /> Open source video
              </a>
            ) : (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] text-muted">
                <Film size={14} /> {campaign.sourceLink}
              </p>
            )}
          </div>
        )}

        {/* Metric cards */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[12px] text-muted">Budget</p>
            <p className="mt-1.5 font-mono text-[18px] font-semibold">{rup(campaign.budget ?? 0)}</p>
            <p className="mt-0.5 text-[11px] text-muted">{rup(remaining)} left · {rup(spent)} spent</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[12px] text-muted">Clippers</p>
            <p className="mt-1.5 font-mono text-[18px] font-semibold">{clippersIn}</p>
            <p className="mt-0.5 text-[11px] text-muted">{campClips.length} submissions</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[12px] text-muted">Time left</p>
            <p className="mt-1.5 font-mono text-[18px] font-semibold">{campaign.daysLeft}d</p>
            <p className="mt-0.5 text-[11px] text-muted">to join</p>
          </div>
        </div>

        {/* Budget bar */}
        {(campaign.budget ?? 0) > 0 && (
          <div className="mt-3 rounded-xl border bg-card p-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
              <span>{rup(spent)} spent</span>
              <span>{rup(remaining)} left</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
              <div
                className={`h-full rounded-full ${
                  pct >= 90 ? "bg-red" : pct >= 70 ? "bg-amber" : "bg-foreground"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {/* Rules */}
        {campaign.rules && (
          <div className="mt-3 rounded-xl border bg-card p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Rules</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{campaign.rules}</p>
          </div>
        )}

        {/* CTA */}
        {campaign.status === "open" && campaign.launchPaymentStatus === "verified" && isClipper && (
          <button
            onClick={join}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2.5 text-[14px] font-medium text-white hover:opacity-90 cursor-pointer"
          >
            <Plus size={15} /> Submit a clip
          </button>
        )}
        {campaign.status === "open" && !isSignedIn && (
          <Link
            href="/login"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-5 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
          >
            Log in to join
          </Link>
        )}

        {/* Submissions */}
        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
            Submissions
          </h2>
          <div className="space-y-3">
            {campClips.map((k) => (
              <div key={k.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/clip/${k.id}`}
                      className="font-medium text-[14px] hover:underline underline-offset-2"
                    >
                      @{k.clipper}
                    </Link>
                    <p className="mt-0.5 truncate text-[12px] text-muted">{k.caption}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {fmtViews(k.verifiedViews ?? 0)} views · {clipEarnings(k, campaigns) ? rup(clipEarnings(k, campaigns)) : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={k.status} />
                  </div>
                </div>
              </div>
            ))}
            {campClips.length === 0 && (
              <p className="rounded-xl border border-dashed border-border/60 bg-card px-6 py-10 text-center text-[14px] text-muted">
                No clips submitted yet. Be the first to contribute.
              </p>
            )}
          </div>
        </section>
      </div>

      {active && (
        <SubmitClipModal
          campaign={campaign}
          onClose={() => setActive(false)}
          onSubmit={async (caption, videoUrl, platform: Platform) => {
            try {
              await addClip({
                campaignId: campaign.id,
                clipper: user?.name ?? user?.email ?? "clipper",
                caption,
                videoUrl,
                platform,
              });
              setActive(false);
            } catch {
              // Error handled by store.lastError — keep modal open
            }
          }}
        />
      )}
    </main>
  );
}
