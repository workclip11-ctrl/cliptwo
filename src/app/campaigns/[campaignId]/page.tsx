"use client";

import { useSyncExternalStore, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  BadgeCheck,
  Film,
  Calendar,
  Wallet,
  Target,
  Sparkles,
  Check,
  X,
  Flag,
  HelpCircle,
  Bookmark,
  Download,
  Clock,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { SubmitClipModal } from "@/components/SubmitClipModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";
import type { Clip, Platform } from "@/lib/types";

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

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <span className="text-foreground/70">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const id = params.campaignId as string;
  const { campaigns, clips, addClip } = useStore();
  const { isSignedIn, user } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [reported, setReported] = useState(false);

  const saved = useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("cliptwo:saved", cb);
      return () => window.removeEventListener("cliptwo:saved", cb);
    },
    () => {
      try {
        const raw = localStorage.getItem("cliptwo:saved-campaigns");
        const arr: string[] = raw ? JSON.parse(raw) : [];
        return arr.includes(id);
      } catch {
        return false;
      }
    },
    () => false,
  );

  const campaign = campaigns.find((c) => c.id === id);
  const campClips = clips.filter((k) => k.campaignId === id);

  function toggleSave() {
    try {
      const raw = localStorage.getItem("cliptwo:saved-campaigns");
      const arr: string[] = raw ? JSON.parse(raw) : [];
      const next = saved ? arr.filter((x) => x !== id) : [...new Set([...arr, id])];
      localStorage.setItem("cliptwo:saved-campaigns", JSON.stringify(next));
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("cliptwo:saved"));
    } catch {
      /* ignore */
    }
  }

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
        <TopBar active="clipper" />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Campaign not found</h1>
          <p className="mt-2 text-sm text-muted">
            This campaign may have been removed.
          </p>
          <Link
            href="/clipper/campaigns"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Back to campaigns
          </Link>
        </div>
      </main>
    );
  }

  const isClipper = user?.role === "clipper";
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(isClipper ? "/clipper/campaigns" : "/creator");
  }
  const platforms = campaign.platforms?.length ? campaign.platforms : [campaign.platform];
  const spent = campaignSpent(campaign, clips);
  const remaining = (campaign.budget ?? 0) - spent;
  const pct = campaign.budget ? Math.min(100, Math.round((spent / campaign.budget) * 100)) : 0;
  const category = campaign.category ?? campaign.niche ?? "—";
  const vr = campaign.viewRules;
  const ap = campaign.approval;

  return (
    <main className="min-h-screen">
      <TopBar active="clipper" />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex items-center gap-3 text-sm text-muted">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* Header */}
        <div
          className={`mt-4 flex h-40 items-center justify-center rounded-2xl bg-gradient-to-br ${gradientFor(campaign.id)} text-foreground/70`}
        >
          <PlatformIcon p={campaign.platform} size={42} />
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{campaign.title}</h1>
              <StatusPill status={campaign.status} />
              {campaign.verified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green/20 bg-green/10 px-2 py-0.5 text-xs font-medium text-green">
                  <BadgeCheck size={13} /> Verified
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              by {campaign.creator} · {category}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium"
                >
                  <PlatformIcon p={p} size={13} /> {p}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-medium text-amber">{rup(campaign.payout)}</p>
            <p className="text-[11px] text-muted">per 1,000 verified views</p>
          </div>
        </div>

        {/* Primary CTA */}
        {campaign.status === "open" && isClipper && (
          <button
            onClick={join}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
          >
            <Plus size={15} /> Submit a Clip
          </button>
        )}

        {/* Secondary actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={toggleSave}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft ${saved ? "text-accent" : ""}`}
          >
            <Bookmark size={14} className={saved ? "fill-accent" : ""} />{" "}
            {saved ? "Saved" : "Save campaign"}
          </button>
          <button
            onClick={() => setReported(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
          >
            <Flag size={14} /> Report
          </button>
          <Link
            href="/clipper/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
          >
            <HelpCircle size={14} /> Ask a question
          </Link>
        </div>
        {reported && (
          <p className="mt-2 rounded-lg border border-amber/20 bg-amber/10 px-3 py-2 text-xs text-amber">
            Thanks — our team will review this report.
          </p>
        )}

        <div className="mt-6 space-y-4">
          {/* Payment information */}
          <Section title="Payment information" icon={<Wallet size={15} />}>
            <Row label="CPM / payout" value={`${rup(campaign.payout)} / 1K views`} />
            <Row label="Total budget" value={rup(campaign.budget ?? 0)} />
            <Row label="Amount spent" value={rup(spent)} />
            <Row label="Remaining budget" value={rup(remaining)} />
            <Row
              label="Max payout / clip"
              value={campaign.maxPayoutPerClip ? rup(campaign.maxPayoutPerClip) : "—"}
            />
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                <span>{rup(spent)} spent</span>
                <span>{rup(remaining)} left</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Campaign timeline" icon={<Calendar size={15} />}>
            <Row label="Start date" value={campaign.startDate ?? "—"} />
            <Row label="End date" value={campaign.endDate ?? "—"} />
            <Row
              label="Days remaining"
              value={
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-muted" /> {campaign.daysLeft ?? "—"}d
                </span>
              }
            />
            <Row label="Status" value={<StatusPill status={campaign.status} />} />
          </Section>

          {/* Objective */}
          <Section title="Campaign objective" icon={<Target size={15} />}>
            <p className="text-sm text-muted">
              {campaign.objective ?? campaign.brief ?? "Not specified."}
            </p>
          </Section>

          {/* Source content */}
          <Section title="Source content" icon={<Film size={15} />}>
            {campaign.sourceLink && (
              <a
                href={campaign.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-2"
              >
                <Film size={14} /> Open source video
              </a>
            )}
            {campaign.sourceAssets?.length ? (
              <div className="mt-2 space-y-2">
                {campaign.sourceAssets.map((a) => (
                  <a
                    key={a.url}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <Download size={14} className="text-muted" /> {a.label}
                    </span>
                    <span className="text-xs text-accent">View / download</span>
                  </a>
                ))}
              </div>
            ) : (
              !campaign.sourceLink && <p className="text-sm text-muted">Not specified.</p>
            )}
          </Section>

          {/* Creative brief */}
          <Section title="Creative brief" icon={<Sparkles size={15} />}>
            <Row label="What to create" value={campaign.brief} />
            <Row label="Recommended duration" value={campaign.recommendedDuration} />
            <Row label="Hook requirements" value={campaign.hook} />
            <Row label="Caption / subtitles" value={campaign.captionReq} />
            <Row label="Aspect ratio" value={campaign.aspectRatio} />
            <Row label="CTA" value={campaign.cta} />
            <Row label="Branding" value={campaign.branding} />
          </Section>

          {/* DO / DON'T */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Section title="Do" icon={<Check size={15} className="text-green" />}>
              {campaign.doList?.length ? (
                <ul className="space-y-2">
                  {campaign.doList.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-muted">
                      <Check size={15} className="mt-0.5 shrink-0 text-green" /> {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Not specified.</p>
              )}
            </Section>
            <Section title="Don't" icon={<X size={15} className="text-red" />}>
              {campaign.dontList?.length ? (
                <ul className="space-y-2">
                  {campaign.dontList.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-muted">
                      <X size={15} className="mt-0.5 shrink-0 text-red" /> {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Not specified.</p>
              )}
            </Section>
          </div>

          {/* View / payment rules */}
          <Section title="View & payment rules" icon={<Wallet size={15} />}>
            <Row label="What counts as a verified view" value={vr?.verifiedView} />
            <Row
              label="Supported platforms"
              value={
                <span className="flex flex-wrap justify-end gap-1.5">
                  {platforms.map((p) => (
                    <span
                      key={p}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-medium"
                    >
                      <PlatformIcon p={p} size={12} /> {p}
                    </span>
                  ))}
                </span>
              }
            />
            <Row label="When views are counted" value={vr?.whenCounted} />
            <Row label="How often views update" value={vr?.updateFrequency} />
            <Row label="Minimum views" value={vr?.minViews ? fmtViews(vr.minViews) : "—"} />
            <Row label="Maximum payout" value={vr?.maxPayout ? rup(vr.maxPayout) : "—"} />
            <Row label="If post is deleted / private" value={vr?.deletedPolicy} />
            <Row label="When earnings become payable" value={vr?.payableWhen} />
          </Section>

          {/* Approval process */}
          <Section title="Approval process" icon={<Check size={15} />}>
            <Row label="After submission" value={ap?.afterSubmission} />
            <Row label="Expected review time" value={ap?.reviewTime} />
            <Row label="Approval criteria" value={ap?.criteria} />
            {ap?.rejectionReasons?.length ? (
              <div className="flex items-start justify-between gap-4 border-b py-2.5 last:border-0">
                <span className="text-sm text-muted">Rejection reasons</span>
                <span className="text-right text-sm font-medium">
                  {ap.rejectionReasons.map((r) => (
                    <span
                      key={r}
                      className="ml-1 inline-flex items-center rounded-md border bg-background px-1.5 py-0.5 text-xs"
                    >
                      {r}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            <Row label="Appeal process" value={ap?.appeal} />
          </Section>

          {/* Example clips */}
          {campaign.exampleClips?.length ? (
            <Section title="Example clips" icon={<Film size={15} />}>
              <div className="space-y-2">
                {campaign.exampleClips.map((e) => (
                  <a
                    key={e.url}
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      {e.platform && <PlatformIcon p={e.platform} size={14} />}
                      <span className="font-medium">{e.caption ?? "Example clip"}</span>
                    </span>
                    <span className="text-xs text-accent">Watch</span>
                  </a>
                ))}
              </div>
            </Section>
          ) : null}

          {/* Submissions on this campaign */}
          <Section title={`Submissions (${campClips.length})`} icon={<Film size={15} />}>
            <div className="space-y-3">
              {campClips.map((k: Clip) => (
                <div key={k.id} className="rounded-xl border bg-background p-4">
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
                        {fmtViews(k.views)} views ·{" "}
                        {clipEarnings(k, campaigns) ? rup(clipEarnings(k, campaigns)) : "—"}
                      </p>
                    </div>
                    <StatusPill status={k.status} />
                  </div>
                </div>
              ))}
              {campClips.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                  No clips submitted yet.
                </p>
              )}
            </div>
          </Section>
        </div>
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
