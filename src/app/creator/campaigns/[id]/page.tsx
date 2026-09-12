"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Pencil,
  Pause,
  Play,
  Ban,
  Wallet,
  Clock,
  ArrowLeft,
  ExternalLink,
  Film,
  Target,
  RotateCcw,
  Loader2,
  Send,
  Calendar,
  Sparkles,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, creatorFee, PLATFORM_FEE_RATE } from "@/lib/finance";
import { seriesByDay } from "@/lib/analytics";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { TopClipsTable } from "@/components/TopClipsTable";
import { TimeSeriesChart } from "@/components/charts";
import { EditCampaignModal } from "@/components/EditCampaignModal";
import { AdjustBudgetModal } from "@/components/AdjustBudgetModal";
import { isStoragePath, resolveAssetUrls, resolveThumbnailUrls } from "@/lib/private-assets";
import type { CampaignSourceAsset } from "@/lib/types";

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentStatusLabel(status: string): string {
  if (status === "submitted") return "Payment pending";
  if (status === "rejected") return "Payment rejected";
  if (status === "verified") return "Payment verified";
  return "Payment required";
}

function paymentStatusColor(status: string): string {
  if (status === "submitted") return "border-amber/20 bg-amber/5 text-amber";
  if (status === "rejected") return "border-red/20 bg-red/5 text-red";
  if (status === "verified") return "border-green/20 bg-green/5 text-green";
  return "border-amber/20 bg-amber/5 text-amber";
}

export default function CreatorCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const {
    campaigns,
    clips,
    updateCampaign,
    financeRecords,
    pauseCampaign,
    resumeCampaign,
    closeCampaign,
    reopenCampaign,
    publishCampaign,
    adjustBudget,
  } = useStore();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [ending, setEnding] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [resolvedSourceAssets, setResolvedSourceAssets] = useState<CampaignSourceAsset[]>([]);
  const [resolvedBrandAssets, setResolvedBrandAssets] = useState<CampaignSourceAsset[]>([]);
  const [resolvedThumbnails, setResolvedThumbnails] = useState<string[]>([]);

  const camp = campaigns.find((c) => c.id === id);

  // Resolve private storage paths to signed URLs for authenticated access
  useEffect(() => {
    if (!camp) return;
    let cancelled = false;
    (async () => {
      const src = camp.sourceAssets ?? [];
      const brand = camp.brandAssets ?? [];
      const thumbs = camp.thumbnails ?? [];
      const [resolvedSrc, resolvedBrand, resolvedThumbs] = await Promise.all([
        resolveAssetUrls(src),
        resolveAssetUrls(brand),
        resolveThumbnailUrls(thumbs),
      ]);
      if (!cancelled) {
        setResolvedSourceAssets(resolvedSrc);
        setResolvedBrandAssets(resolvedBrand);
        setResolvedThumbnails(resolvedThumbs);
      }
    })();
    return () => { cancelled = true; };
  }, [camp?.id, camp?.sourceAssets, camp?.brandAssets, camp?.thumbnails]);

  if (!camp) {
    return (
      <div className="mx-auto max-w-[1120px] space-y-6 px-5 py-10 sm:px-8">
        <Link
          href="/creator/campaigns"
          className="inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to campaigns
        </Link>
        <div className="rounded-[12px] border border-dashed bg-card py-16 text-center">
          <p className="text-[16px] font-medium">Campaign not found</p>
          <p className="mt-2 text-[14px] text-muted">
            It may have been deleted or isn&apos;t yours.
          </p>
        </div>
      </div>
    );
  }

  const actor = user?.email ?? user?.name ?? "Creator";
  const campClips = clips.filter((k) => k.campaignId === id);
  const fin = financeOf(financeRecords, (r) => r.campaignId === id);
  const currentSpend = fin.paid / 100;
  const verifiedViews = campClips.reduce(
    (s, k) => s + (k.verifiedViews ?? 0),
    0,
  );
  const clipperSet = new Set(campClips.map((k) => k.userId ?? k.clipper));
  const avgCPM =
    verifiedViews > 0 && currentSpend > 0
      ? currentSpend / (verifiedViews / 1000)
      : null;
  const engagement = campClips.reduce((s, k) => {
    if (!k.engagement) return s;
    return (
      s +
      (k.engagement.likes ?? 0) +
      (k.engagement.comments ?? 0) +
      (k.engagement.shares ?? 0)
    );
  }, 0);
  const budget = camp.budget ?? 0;
  const remaining = Math.max(0, budget - currentSpend);
  const budgetPct =
    budget > 0 ? Math.min(100, Math.round((currentSpend / budget) * 100)) : 0;
  const isClosed = camp.status === "closed";
  const isPaused = camp.status === "paused";
  const isDraft = camp.status === "draft";
  const isOpen = camp.status === "open";

  const viewsSeries = seriesByDay(campClips, (k) => k.verifiedViews ?? 0);
  const spendSeries = seriesByDay(campClips, (k) => clipEarnings(k, campaigns));

  const handleEdit = (patch: Partial<typeof camp>, note?: string) =>
    updateCampaign(camp.id, patch, actor, "edited", note);
  const handleBudget = (b: number, note: string) => {
    adjustBudget(camp.id, b, note).then(() => setAdjusting(false));
  };
  const handlePause = () => {
    setPausing(true);
    pauseCampaign(camp.id, "Paused by creator").finally(() =>
      setPausing(false),
    );
  };
  const handleResume = () => {
    setResuming(true);
    resumeCampaign(camp.id, "Resumed by creator").finally(() =>
      setResuming(false),
    );
  };
  const handleEnd = () => {
    if (
      !confirm("End this campaign? It will stop accepting new submissions.")
    )
      return;
    setEnding(true);
    closeCampaign(camp.id, "Ended by creator").finally(() =>
      setEnding(false),
    );
  };
  const handleReopen = () => {
    if (
      !confirm(
        "Reopen this campaign? It will start accepting submissions again.",
      )
    )
      return;
    setReopening(true);
    reopenCampaign(camp.id, "Reopened by creator").finally(() =>
      setReopening(false),
    );
  };
  const handlePublish = () => {
    if (
      !confirm(
        "Publish this campaign? It will become live and visible to clippers.",
      )
    )
      return;
    setPublishing(true);
    publishCampaign(camp.id, "Published by creator").finally(() =>
      setPublishing(false),
    );
  };

  return (
    <div className="mx-auto max-w-[1120px] space-y-16 px-5 py-10 sm:px-8">
      {/* ── Back navigation ─────────────────────────────── */}
      <Link
        href="/creator/campaigns"
        className="inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      {/* ── Campaign Hero ───────────────────────────────── */}
      <section className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        {/* Thumbnail — visual anchor */}
        <div className="shrink-0 overflow-hidden rounded-[12px] bg-accent-soft lg:w-[420px]">
          {camp.thumbnails?.[0] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={camp.thumbnails[0]}
              alt="Campaign thumbnail"
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center">
              <PlatformIcon p={camp.platform} size={48} />
            </div>
          )}
        </div>

        {/* Campaign identity */}
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <PlatformIcon p={camp.platform} size={14} />
            {camp.category ?? camp.niche ?? "Campaign"} · {camp.platform}
          </span>
          <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
            {camp.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <StatusPill status={camp.status} />
            {camp.launchPaymentStatus &&
              camp.launchPaymentStatus !== "verified" && (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${paymentStatusColor(camp.launchPaymentStatus)}`}
                >
                  {paymentStatusLabel(camp.launchPaymentStatus)}
                </span>
              )}
          </div>

          {/* Quick metadata */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted">
            {camp.startDate && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} /> {camp.startDate}
                {camp.endDate ? ` → ${camp.endDate}` : ""}
              </span>
            )}
            {camp.daysLeft != null && (
              <span className="flex items-center gap-1.5">
                <Clock size={13} /> {camp.daysLeft}d remaining
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} /> {campClips.length} clips
            </span>
          </div>

          {/* Payout — dominant */}
          <div className="mt-6">
            <p className="text-[13px] text-muted">Payout per 1K views</p>
            <p className="mt-1 font-mono text-[24px] font-bold tracking-tight text-amber">
              {rup(camp.payout)}
            </p>
          </div>
        </div>
      </section>

      {/* ── Actions ─────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-2.5">
        {/* Primary action */}
        {isDraft && (
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}{" "}
            {publishing ? "Publishing..." : "Publish"}
          </button>
        )}
        {isPaused && (
          <button
            onClick={handleResume}
            disabled={resuming}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 disabled:opacity-50"
          >
            {resuming ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Play size={16} />
            )}{" "}
            Resume
          </button>
        )}
        {isClosed && (
          <button
            onClick={handleReopen}
            disabled={reopening}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 disabled:opacity-50"
          >
            {reopening ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RotateCcw size={16} />
            )}{" "}
            Reopen
          </button>
        )}

        {/* Secondary actions */}
        <button
          onClick={() => setEditing(true)}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border bg-card px-5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
        >
          <Pencil size={15} /> Edit
        </button>
        {!isClosed && (
          <button
            onClick={() => setAdjusting(true)}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border bg-card px-5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
          >
            <Wallet size={15} /> Adjust budget
          </button>
        )}

        {/* Destructive actions — quiet */}
        {isOpen && (
          <button
            onClick={handlePause}
            disabled={pausing}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border px-5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground disabled:opacity-50"
          >
            {pausing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Pause size={16} />
            )}{" "}
            Pause
          </button>
        )}
        {!isClosed && !isDraft && (
          <button
            onClick={handleEnd}
            disabled={ending}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-red/30 px-5 text-[14px] font-medium text-red transition-colors duration-150 hover:bg-red/5 disabled:opacity-50"
          >
            {ending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Ban size={16} />
            )}{" "}
            End
          </button>
        )}
      </section>

      {/* ── Launch Payment Status (for draft campaigns) ── */}
      {isDraft && camp.launchPaymentStatus && (
        <div
          className={`rounded-[12px] border px-5 py-4 ${paymentStatusColor(camp.launchPaymentStatus)}`}
        >
          <p className="text-[14px] font-medium">
            {camp.launchPaymentStatus === "submitted"
              ? "Payment verification pending"
              : camp.launchPaymentStatus === "rejected"
                ? "Payment rejected — please resubmit"
                : "Payment required to publish"}
          </p>
          <p className="mt-1 text-[13px] opacity-80">
            {camp.launchPaymentStatus === "submitted"
              ? "Your campaign will be published after admin verifies your payment."
              : camp.launchPaymentStatus === "rejected"
                ? "Contact admin or resubmit payment from the campaign creation page."
                : `Pay ${rup((budget ?? 0) + Math.floor((budget ?? 0) * 0.10))} to publish this campaign.`}
          </p>
        </div>
      )}

      {/* ── Budget & Spend ───────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Budget &amp; spend
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Campaign funding and remaining capacity.
        </p>
        <div className="rounded-[12px] border bg-card px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[13px] text-muted">Budget</p>
              <p className="mt-1.5 font-mono text-[22px] font-bold tracking-tight">
                {rup(budget)}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Remaining</p>
              <p
                className={`mt-1.5 font-mono text-[22px] font-bold tracking-tight ${remaining <= 0 ? "text-red" : ""}`}
              >
                {rup(remaining)}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4 text-[14px]">
            <div>
              <span className="text-muted">Spent </span>
              <span className="font-medium">{rup(currentSpend)}</span>
            </div>
            <div>
              <span className="text-muted">Platform fee </span>
              <span className="font-medium">{rup(creatorFee(currentSpend))}</span>
            </div>
            {camp.startDate && (
              <div>
                <span className="text-muted">Starts </span>
                <span className="font-medium">{camp.startDate}</span>
              </div>
            )}
            {camp.endDate && (
              <div>
                <span className="text-muted">Ends </span>
                <span className="font-medium">{camp.endDate}</span>
              </div>
            )}
          </div>
          {budget > 0 && (
            <div className="mt-5">
              <div className="h-[4px] w-full overflow-hidden rounded-full bg-accent-soft">
                <div
                  className={`h-full rounded-full ${remaining <= 0 ? "bg-red" : "bg-foreground"}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              {remaining <= 0 && (
                <p className="mt-2 text-[13px] text-red">
                  Budget reached — this campaign cannot spend beyond its
                  configured budget.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Performance ──────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Performance
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Aggregated campaign metrics.
        </p>
        {/* Primary metrics */}
        <div className="mb-6 flex flex-wrap gap-x-12 gap-y-6">
          <div>
            <p className="text-[13px] text-muted">Verified views</p>
            <p className="mt-1.5 font-mono text-[22px] font-bold tracking-tight">
              {fmtViews(verifiedViews)}
            </p>
          </div>
          <div>
            <p className="text-[13px] text-muted">Spend</p>
            <p className="mt-1.5 font-mono text-[22px] font-bold tracking-tight">
              {rup(currentSpend)}
            </p>
          </div>
        </div>
        {/* Secondary metrics */}
        <div className="flex flex-wrap gap-x-10 gap-y-4 text-[14px]">
          <div>
            <span className="text-muted">Clips </span>
            <span className="font-medium">{campClips.length}</span>
          </div>
          <div>
            <span className="text-muted">Clippers </span>
            <span className="font-medium">{clipperSet.size}</span>
          </div>
          <div>
            <span className="text-muted">Avg CPM </span>
            <span className="font-medium">
              {avgCPM != null ? rup(avgCPM) : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted">Engagement </span>
            <span className="font-medium">
              {engagement > 0 ? fmtViews(engagement) : "—"}
            </span>
          </div>
        </div>
      </section>

      {/* ── Campaign Brief ──────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Campaign brief
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          What clippers need to know before creating content.
        </p>
        <div className="space-y-6">
          {camp.brief && (
            <div>
              <p className="text-[14px] leading-relaxed text-muted">
                {camp.brief}
              </p>
            </div>
          )}
          {camp.objective && (
            <div>
              <h3 className="mb-1.5 flex items-center gap-2 text-[15px] font-semibold">
                <Target size={14} className="text-muted" /> Objective
              </h3>
              <p className="text-[14px] leading-relaxed text-muted">
                {camp.objective}
              </p>
            </div>
          )}
          {(camp.whatToMake || camp.hook || camp.cta) && (
            <div>
              <h3 className="mb-2 text-[15px] font-semibold">
                Creative direction
              </h3>
              <dl className="space-y-2">
                {camp.whatToMake && (
                  <DefRow label="What to make" value={camp.whatToMake} />
                )}
                {camp.hook && <DefRow label="Hook" value={camp.hook} />}
                {camp.cta && <DefRow label="CTA" value={camp.cta} />}
              </dl>
            </div>
          )}
          {(camp.style || camp.branding || camp.recommendedDuration) && (
            <div>
              <h3 className="mb-2 text-[15px] font-semibold">
                Brand &amp; style
              </h3>
              <dl className="space-y-2">
                {camp.style && <DefRow label="Style" value={camp.style} />}
                {camp.branding && (
                  <DefRow label="Branding" value={camp.branding} />
                )}
                {camp.recommendedDuration && (
                  <DefRow
                    label="Recommended duration"
                    value={camp.recommendedDuration}
                  />
                )}
              </dl>
            </div>
          )}
          {(camp.category || camp.niche) && (
            <div className="flex flex-wrap gap-2">
              {camp.category && (
                <span className="inline-flex items-center rounded-full border border-border/50 bg-accent-soft/50 px-3 py-1 text-[13px] text-muted">
                  {camp.category}
                </span>
              )}
              {camp.niche && (
                <span className="inline-flex items-center rounded-full border border-border/50 bg-accent-soft/50 px-3 py-1 text-[13px] text-muted">
                  {camp.niche}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Source Assets ────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Source assets
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Reference materials for clippers.
        </p>
        {(() => {
          const hasAssets =
            camp.sourceLink ||
            resolvedThumbnails.length ||
            resolvedBrandAssets.length ||
            resolvedSourceAssets.length ||
            camp.exampleClips?.length;
          if (!hasAssets) {
            return (
              <p className="py-6 text-[14px] text-muted">
                No source assets added.
              </p>
            );
          }
          return (
            <div className="space-y-3">
              {camp.sourceLink && (
                <AssetRow label="Source video" value={camp.sourceLink} />
              )}
              {resolvedThumbnails.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {resolvedThumbnails.map((t, i) => (
                    <AssetThumb key={`thumb-${i}`} label={`Thumbnail ${i + 1}`} value={t} />
                  ))}
                </div>
              ) : null}
              {resolvedBrandAssets.map((a, i) => (
                <AssetRow
                  key={`brand-${i}`}
                  label={a.label || `Brand asset ${i + 1}`}
                  value={a.url}
                />
              ))}
              {resolvedSourceAssets.map((a, i) => (
                <AssetRow
                  key={`src-${i}`}
                  label={a.label || `Asset ${i + 1}`}
                  value={a.url}
                />
              ))}
              {camp.exampleClips?.map((a, i) => (
                <AssetRow
                  key={`ex-${i}`}
                  label={`Example ${i + 1}`}
                  value={a.url}
                />
              ))}
            </div>
          );
        })()}
      </section>

      {/* ── Rules ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">Rules</h2>
        <p className="mb-5 text-[14px] text-muted">
          Constraints and guidelines for this campaign.
        </p>

        {/* Campaign rules — general */}
        {camp.rules && (
          <div className="mb-5">
            <p className="mb-1.5 text-[13px] font-medium text-muted">Campaign rules</p>
            <p className="text-[14px] leading-relaxed text-foreground/80">
              {camp.rules}
            </p>
          </div>
        )}

        {/* Requirements — numeric constraints */}
        {(camp.viewRules?.minViews != null ||
          camp.maxPayoutPerClip != null ||
          camp.spendCap != null ||
          camp.approval?.autoReview != null ||
          camp.approval?.reviewTime) && (
          <div className="mb-5">
            <p className="mb-2.5 text-[13px] font-medium text-muted">Requirements</p>
            <div className="flex flex-wrap gap-x-8 gap-y-2.5 text-[14px]">
              {camp.viewRules?.minViews != null && (
                <div>
                  <span className="text-muted">Min views </span>
                  <span className="font-medium">{fmtViews(camp.viewRules.minViews)}</span>
                </div>
              )}
              {camp.maxPayoutPerClip != null && (
                <div>
                  <span className="text-muted">Max payout / clip </span>
                  <span className="font-medium">{rup(camp.maxPayoutPerClip)}</span>
                </div>
              )}
              {camp.spendCap != null && (
                <div>
                  <span className="text-muted">Spend cap </span>
                  <span className="font-medium">{rup(camp.spendCap)}</span>
                </div>
              )}
              <div>
                <span className="text-muted">Auto-approve </span>
                <span className="font-medium">{camp.approval?.autoReview ? "Yes" : "No"}</span>
              </div>
              {camp.approval?.reviewTime && (
                <div>
                  <span className="text-muted">Review time </span>
                  <span className="font-medium">{camp.approval.reviewTime}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Do */}
        {camp.doList?.length ? (
          <div className="mb-5">
            <p className="mb-2.5 text-[13px] font-medium text-green">Do</p>
            <ul className="space-y-1 text-[14px] text-foreground/80">
              {camp.doList.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Don't */}
        {camp.dontList?.length ? (
          <div>
            <p className="mb-2.5 text-[13px] font-medium text-red">Don&apos;t</p>
            <ul className="space-y-1 text-[14px] text-foreground/80">
              {camp.dontList.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ── Submissions ──────────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Submissions
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Clips submitted to this campaign.
        </p>
        <ClipList clips={campClips} earned={false} />
      </section>

      {/* ── Approved Clips ───────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Approved clips
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Clips contributing to campaign spend and performance.
        </p>
        <ClipList clips={campClips} earned />
      </section>

      {/* ── Analytics ────────────────────────────────────── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold tracking-tight">
            Performance over time
          </h2>
          <Link
            href={`/creator/analytics/${camp.id}`}
            className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted cursor-pointer transition-colors duration-150 hover:text-foreground"
          >
            Full analytics
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
        <div className="rounded-[12px] border border-border/40 bg-card p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-[13px] font-medium text-muted">
                Views over time
              </p>
              <TimeSeriesChart data={viewsSeries} format={fmtViews} />
            </div>
            <div className="lg:border-l lg:border-border/40 lg:pl-6">
              <p className="mb-3 text-[13px] font-medium text-muted">
                Spend over time
              </p>
              <TimeSeriesChart data={spendSeries} format={rup} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Top Performing Clips ─────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Top performing clips
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Highest-performing submissions by views.
        </p>
        <TopClipsTable clips={campClips} campaigns={campaigns} />
      </section>

      {/* ── Budget & Transactions ────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Budget &amp; transactions
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Payout ledger for approved clips. A{" "}
          {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee applies.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border/50 text-left text-[13px] text-muted">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Clipper</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Fee</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {campClips
                .filter(
                  (k) => k.status === "approved" || k.status === "held",
                )
                .sort((a, b) => b.submittedAt - a.submittedAt)
                .map((k) => {
                  const gross = clipEarnings(k, campaigns);
                  const fee = creatorFee(gross);
                  return (
                    <tr key={k.id} className="transition-colors duration-100 hover:bg-accent-soft/30">
                      <td className="px-4 py-3 text-muted">
                        {fmtDateTime(k.submittedAt)}
                      </td>
                      <td className="px-4 py-3 font-medium">@{k.clipper}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={k.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {rup(gross)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
                        {rup(fee)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {rup(gross - fee)}
                      </td>
                    </tr>
                  );
                })}
              {campClips.filter(
                (k) => k.status === "approved" || k.status === "held",
              ).length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-muted"
                  >
                    No payouts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Content Rights ───────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
          Content rights
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Where clippers may use approved content.
        </p>
        {camp.rights ? (
          <div className="space-y-1.5">
            {(
              [
                ["Ads", camp.rights.ads],
                ["Social", camp.rights.social],
                ["Website", camp.rights.website],
                ["Other", camp.rights.other],
              ] as Array<[string, boolean]>
            ).map(([label, on]) => (
              <div key={label} className="flex items-center gap-3 text-[14px]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-green" : "bg-border"}`}
                />
                <span className="text-muted">{label}</span>
                <span className={on ? "font-medium text-foreground" : "text-muted"}>
                  {on ? "Enabled" : "Disabled"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-muted">No rights specified.</p>
        )}
        {camp.rights?.otherText && (
          <p className="mt-3 text-[13px] text-muted">
            {camp.rights.otherText}
          </p>
        )}
      </section>

      {/* ── Activity ────────────────────────────────────── */}
      {camp.audit && camp.audit.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-[20px] font-bold tracking-tight">
            Activity
          </h2>
          <p className="mb-5 text-[14px] text-muted">
            Campaign change history.
          </p>
          <div className="relative ml-2 space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[3px] top-2 bottom-2 w-px bg-border/50" />
            {camp.audit.map((e, i) => (
              <div key={i} className="relative flex gap-4 py-3.5">
                <span className="relative z-10 mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full border-2 border-foreground/20 bg-background" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium capitalize">
                    {e.action}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {e.by ? `${e.by} · ` : ""}
                    {fmtDateTime(e.at)}
                  </p>
                  {e.note && (
                    <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Modals ──────────────────────────────────────── */}
      {editing && (
        <EditCampaignModal
          campaign={camp}
          submissionCount={campClips.length}
          currentSpend={currentSpend}
          onClose={() => setEditing(false)}
          onSave={(patch, note) => {
            handleEdit(patch, note);
            setEditing(false);
          }}
        />
      )}
      {adjusting && (
        <AdjustBudgetModal
          campaign={camp}
          currentSpend={currentSpend}
          onClose={() => setAdjusting(false)}
          onSave={(b, note) => {
            handleBudget(b, note);
            setAdjusting(false);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Supporting components
   ──────────────────────────────────────────────────────────────────────────── */

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[14px]">
      <dt className="w-44 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

function AssetRow({ label, value }: { label: string; value: string }) {
  const isVideo = /\.(mp4|webm|mov|avi)$/i.test(value);
  const fileName = value.split("/").pop()?.split("?")[0] ?? value;
  const displayName =
    fileName.length > 40 ? fileName.slice(0, 37) + "..." : fileName;

  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-[10px] border border-border/40 bg-card px-4 py-3 cursor-pointer transition-colors duration-150 hover:border-foreground/10"
    >
      {isVideo ? (
        <Film size={14} className="shrink-0 text-muted" />
      ) : (
        <ExternalLink size={13} className="shrink-0 text-muted" />
      )}
      <span className="w-28 shrink-0 text-[13px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-[14px] font-medium text-accent">
        {displayName}
      </span>
    </a>
  );
}

function AssetThumb({ label, value }: { label: string; value: string }) {
  return (
    <a
      href={value}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-[10px] border border-border/40 bg-card cursor-pointer transition-colors duration-150 hover:border-foreground/10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={value}
        alt={label}
        className="aspect-video w-full object-cover transition-opacity duration-150 group-hover:opacity-80"
      />
      <div className="px-3.5 py-2.5">
        <p className="text-[13px] font-medium text-muted">{label}</p>
      </div>
    </a>
  );
}

function ClipList({
  clips,
  earned,
}: {
  clips: import("@/lib/types").Clip[];
  earned: boolean;
}) {
  const list = earned
    ? clips.filter((k) => k.status === "approved" || k.status === "held")
    : clips;
  if (list.length === 0)
    return (
      <p className="py-6 text-[14px] text-muted">Nothing here yet.</p>
    );
  return (
    <div className="space-y-2">
      {list.map((k) => (
        <Link
          key={k.id}
          href={`/clip/${k.id}`}
          className="flex items-center justify-between gap-3 rounded-[12px] border bg-card p-3.5 cursor-pointer transition-all duration-150 hover:border-foreground/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium">{k.caption}</p>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              @{k.clipper} · {fmtViews(k.verifiedViews ?? 0)} views
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PlatformIcon p={k.platform ?? "Instagram"} size={14} />
            <StatusPill status={k.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}
