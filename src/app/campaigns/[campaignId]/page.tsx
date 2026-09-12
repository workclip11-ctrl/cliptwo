"use client";

import { useState, useEffect, type ReactNode } from "react";
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
import { isStoragePath, resolveAssetUrls, resolveThumbnailUrls } from "@/lib/private-assets";
import type { Clip, Platform, CampaignSourceAsset } from "@/lib/types";

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
    <section className="rounded-xl border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-muted">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams<{ campaignId: string }>();
  const id = params.campaignId as string;
  const { campaigns, clips, addClip, savedCampaigns, toggleSaveCampaign, financeRecords } = useStore();
  const { isSignedIn, user } = useAuth();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [reported, setReported] = useState(false);
  const [resolvedSourceAssets, setResolvedSourceAssets] = useState<CampaignSourceAsset[]>([]);
  const [resolvedThumbnails, setResolvedThumbnails] = useState<string[]>([]);

  const saved = savedCampaigns.includes(id);

  const campaign = campaigns.find((c) => c.id === id);
  const campClips = clips.filter((k) => k.campaignId === id);

  // Resolve private storage paths to signed URLs for authenticated access
  useEffect(() => {
    if (!campaign) return;
    let cancelled = false;
    (async () => {
      const src = campaign.sourceAssets ?? [];
      const thumbs = campaign.thumbnails ?? [];
      const [resolvedSrc, resolvedThumbs] = await Promise.all([
        resolveAssetUrls(src),
        resolveThumbnailUrls(thumbs),
      ]);
      if (!cancelled) {
        setResolvedSourceAssets(resolvedSrc);
        setResolvedThumbnails(resolvedThumbs);
      }
    })();
    return () => { cancelled = true; };
  }, [campaign?.id, campaign?.sourceAssets, campaign?.thumbnails]);

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
          <h1 className="text-2xl font-bold">Campaign not found</h1>
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
  const spent = campaignSpent(campaign, financeRecords);
  const remaining = (campaign.budget ?? 0) - spent;
  const pct = campaign.budget ? Math.min(100, Math.round((spent / campaign.budget) * 100)) : 0;
  const category = campaign.category ?? campaign.niche ?? "—";
  const vr = campaign.viewRules;
  const ap = campaign.approval;
  const thumb = resolvedThumbnails[0] ?? campaign.thumbnails?.[0];
  const isUrgent = (campaign.daysLeft ?? 99) <= 7;

  return (
    <main className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Back */}
        <div className="flex items-center gap-3 text-sm text-muted">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* ─── Hero ─── */}
        <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_1fr]">
          {/* Image */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-accent-soft">
            {thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={thumb}
                alt={campaign.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <PlatformIcon p={campaign.platform} size={42} />
              </div>
            )}
            {/* Badges */}
            <div className="absolute left-3 top-3 flex items-center gap-1.5">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 rounded-md bg-card/90 px-2 py-[3px] text-[10px] font-medium text-foreground shadow-sm backdrop-blur"
                >
                  <PlatformIcon p={p} size={10} /> {p}
                </span>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col">
            {/* Title + status */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{campaign.title}</h1>
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

            {/* Payout — dominant */}
            <div className="mt-4">
              <p className="font-mono text-3xl font-bold tracking-tight">
                {rup(campaign.payout)}
              </p>
              <p className="text-sm text-muted">per 1,000 views</p>
            </div>

            {/* Secondary metrics */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {campaign.budget ? (
                <div>
                  <p className="font-medium">{rup(remaining)}</p>
                  <p className="text-xs text-muted">remaining</p>
                </div>
              ) : null}
              <div>
                <p className={`font-medium ${isUrgent ? "text-amber" : ""}`}>
                  {campaign.daysLeft}d left
                </p>
                <p className="text-xs text-muted">
                  {campaign.endDate ? `Ends ${campaign.endDate}` : "Deadline"}
                </p>
              </div>
              {vr?.minViews != null && vr.minViews > 0 && (
                <div>
                  <p className="font-medium">{fmtViews(vr.minViews)}</p>
                  <p className="text-xs text-muted">min views</p>
                </div>
              )}
            </div>

            {/* Budget bar */}
            {(campaign.budget ?? 0) > 0 && (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                  <span>{rup(spent)} spent</span>
                  <span>{pct}% used</span>
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

            {/* Primary CTA */}
            {campaign.status === "open" && isClipper && (
              <button
                onClick={join}
                className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus size={15} /> Submit a Clip
              </button>
            )}

            {/* Secondary actions */}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => toggleSaveCampaign(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft ${saved ? "text-accent" : ""}`}
              >
                <Bookmark size={14} className={saved ? "fill-accent" : ""} />{" "}
                {saved ? "Saved" : "Save"}
              </button>
              <button
                onClick={() => setReported(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted hover:bg-accent-soft"
              >
                <Flag size={14} /> Report
              </button>
              <Link
                href="/clipper/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted hover:bg-accent-soft"
              >
                <HelpCircle size={14} /> Ask
              </Link>
            </div>
            {reported && (
              <p className="mt-2 text-xs text-amber">
                Thanks — our team will review this report.
              </p>
            )}
          </div>
        </div>

        {/* ─── Content sections ─── */}
        <div className="mt-8 space-y-4">
          {/* Campaign objective */}
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
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-2"
              >
                <Film size={14} /> Open source video
              </a>
            )}
            {resolvedSourceAssets.length ? (
              <div className="mt-2 space-y-2">
                {resolvedSourceAssets.map((a) => (
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
            <div className="space-y-3">
              {campaign.brief && (
                <div>
                  <p className="text-xs font-medium text-muted">What to create</p>
                  <p className="mt-0.5 text-sm">{campaign.brief}</p>
                </div>
              )}
              {campaign.recommendedDuration && (
                <div>
                  <p className="text-xs font-medium text-muted">Duration</p>
                  <p className="mt-0.5 text-sm">{campaign.recommendedDuration}</p>
                </div>
              )}
              {campaign.hook && (
                <div>
                  <p className="text-xs font-medium text-muted">Hook</p>
                  <p className="mt-0.5 text-sm">{campaign.hook}</p>
                </div>
              )}
              {campaign.captionReq && (
                <div>
                  <p className="text-xs font-medium text-muted">Caption</p>
                  <p className="mt-0.5 text-sm">{campaign.captionReq}</p>
                </div>
              )}
              {campaign.aspectRatio && (
                <div>
                  <p className="text-xs font-medium text-muted">Format</p>
                  <p className="mt-0.5 text-sm">{campaign.aspectRatio}</p>
                </div>
              )}
              {campaign.cta && (
                <div>
                  <p className="text-xs font-medium text-muted">CTA</p>
                  <p className="mt-0.5 text-sm">{campaign.cta}</p>
                </div>
              )}
              {campaign.branding && (
                <div>
                  <p className="text-xs font-medium text-muted">Branding</p>
                  <p className="mt-0.5 text-sm">{campaign.branding}</p>
                </div>
              )}
              {!campaign.brief && !campaign.recommendedDuration && !campaign.hook && (
                <p className="text-sm text-muted">Not specified.</p>
              )}
            </div>
          </Section>

          {/* Do / Don't */}
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

          {/* View + payment rules */}
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
          </Section>

          {/* Approval process */}
          <Section title="Approval process" icon={<Check size={15} />}>
            <Row label="After submission" value={ap?.afterSubmission} />
            <Row label="Expected review time" value={ap?.reviewTime} />
            <Row label="Approval criteria" value={ap?.criteria} />
            {ap?.rejectionReasons?.length ? (
              <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
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

          {/* Timeline */}
          <Section title="Timeline" icon={<Calendar size={15} />}>
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

          {/* Submissions */}
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
                        {fmtViews(k.verifiedViews ?? 0)} views ·{" "}
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
