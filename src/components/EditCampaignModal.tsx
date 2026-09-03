"use client";

import { useState, useRef, type ReactNode } from "react";
import { X, Upload, Loader2, ImageIcon, FileText, XCircle } from "lucide-react";
import { rup } from "@/lib/format";
import { uploadCampaignFile } from "@/lib/upload";
import type { Campaign, CampaignRights, Platform } from "@/lib/types";

const PLATFORM_OPTIONS: Platform[] = ["Instagram", "YouTube", "Kick"];

const CATEGORIES = [
  "Tech",
  "Fitness",
  "Beauty",
  "Food",
  "Finance",
  "Travel",
  "Gaming",
  "Education",
  "Entertainment",
  "Other",
];

// Fields whose change after submissions exist must be flagged + audited.
function importantSignature(c: Campaign): string {
  return JSON.stringify({
    payout: c.payout,
    budget: c.budget ?? 0,
    rules: c.rules ?? "",
    platforms: [...(c.platforms ?? [c.platform])].sort().join(","),
    maxPayoutPerClip: c.maxPayoutPerClip ?? null,
    spendCap: c.spendCap ?? null,
    minViews: c.viewRules?.minViews ?? null,
    rights: c.rights ?? null,
    autoReview: c.approval?.autoReview ?? null,
    reviewTime: c.approval?.reviewTime ?? null,
  });
}

function emptyRights(): CampaignRights {
  return { ads: false, social: false, website: false, other: false };
}

export function EditCampaignModal({
  campaign,
  submissionCount,
  currentSpend,
  onClose,
  onSave,
}: {
  campaign: Campaign;
  submissionCount: number;
  currentSpend: number;
  onClose: () => void;
  onSave: (patch: Partial<Campaign>, note?: string) => void;
}) {
  const [title, setTitle] = useState(campaign.title);
  const [category, setCategory] = useState(campaign.category ?? "Tech");
  const [objective, setObjective] = useState(campaign.objective ?? "");
  const [brief, setBrief] = useState(campaign.brief);
  const [platforms, setPlatforms] = useState<Platform[]>(
    campaign.platforms?.length ? campaign.platforms : [campaign.platform],
  );
  const [payout, setPayout] = useState(String(campaign.payout));
  const [budget, setBudget] = useState(String(campaign.budget ?? 0));
  const [maxPerClip, setMaxPerClip] = useState(
    campaign.maxPayoutPerClip != null ? String(campaign.maxPayoutPerClip) : "",
  );
  const [spendCap, setSpendCap] = useState(
    campaign.spendCap != null ? String(campaign.spendCap) : "",
  );
  const [minViews, setMinViews] = useState(
    campaign.viewRules?.minViews != null ? String(campaign.viewRules.minViews) : "",
  );
  const [startDate, setStartDate] = useState(campaign.startDate ?? "");
  const [endDate, setEndDate] = useState(campaign.endDate ?? "");
  const [timezone, setTimezone] = useState(campaign.timezone ?? "");
  const [whatToMake, setWhatToMake] = useState(campaign.whatToMake ?? "");
  const [hook, setHook] = useState(campaign.hook ?? "");
  const [cta, setCta] = useState(campaign.cta ?? "");
  const [recDuration, setRecDuration] = useState(campaign.recommendedDuration ?? "");
  const [style, setStyle] = useState(campaign.style ?? "");
  const [branding, setBranding] = useState(campaign.branding ?? "");
  const [rules, setRules] = useState(campaign.rules ?? "");
  const [autoReview, setAutoReview] = useState(campaign.approval?.autoReview ?? false);
  const [reviewTime, setReviewTime] = useState(campaign.approval?.reviewTime ?? "");
  const [rights, setRights] = useState<CampaignRights>(campaign.rights ?? emptyRights());
  const [sourceLink, setSourceLink] = useState(campaign.sourceLink ?? "");
  const [thumbnail, setThumbnail] = useState<string | null>(
    campaign.thumbnails?.[0] ?? null,
  );
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [brandAsset, setBrandAsset] = useState<string | null>(
    campaign.brandAssets?.[0]?.url ?? null,
  );
  const [brandAssetUploading, setBrandAssetUploading] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const [confirmRules, setConfirmRules] = useState(false);
  const [budgetError, setBudgetError] = useState("");

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const newSignature = importantSignature({
    ...campaign,
    payout: Number(payout) || 0,
    budget: Number(budget) || 0,
    rules,
    platforms,
    maxPayoutPerClip: maxPerClip ? Number(maxPerClip) : undefined,
    spendCap: spendCap ? Number(spendCap) : undefined,
    viewRules: minViews ? { ...campaign.viewRules, minViews: Number(minViews) } : campaign.viewRules,
    rights,
    approval: { ...campaign.approval, autoReview, reviewTime },
  });

  const importantChanged = newSignature !== importantSignature(campaign);
  const needsConfirm = importantChanged && submissionCount > 0;

  const handleThumbUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    const url = await uploadCampaignFile("thumbnail", file);
    if (url) setThumbnail(url);
    setThumbnailUploading(false);
    e.target.value = "";
  };

  const handleBrandAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrandAssetUploading(true);
    const url = await uploadCampaignFile("brand-asset", file);
    if (url) setBrandAsset(url);
    setBrandAssetUploading(false);
    e.target.value = "";
  };

  const handleSave = () => {
    const b = Number(budget) || 0;
    if (b < currentSpend) {
      setBudgetError(
        `Budget cannot be lower than the amount already spent (${rup(currentSpend)}).`,
      );
      return;
    }
    setBudgetError("");

    const patch: Partial<Campaign> = {
      title: title.trim() || campaign.title,
      category,
      objective: objective.trim() || undefined,
      brief: brief.trim(),
      platforms,
      payout: Number(payout) || campaign.payout,
      budget: b,
      maxPayoutPerClip: maxPerClip ? Number(maxPerClip) : undefined,
      spendCap: spendCap ? Number(spendCap) : undefined,
      viewRules: minViews ? { ...campaign.viewRules, minViews: Number(minViews) } : campaign.viewRules,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      timezone: timezone.trim() || undefined,
      whatToMake: whatToMake.trim() || undefined,
      hook: hook.trim() || undefined,
      cta: cta.trim() || undefined,
      recommendedDuration: recDuration.trim() || undefined,
      style: style.trim() || undefined,
      branding: branding.trim() || undefined,
      rules: rules.trim() || undefined,
      approval: { ...campaign.approval, autoReview, reviewTime: reviewTime.trim() || undefined },
      rights,
      sourceLink: sourceLink.trim() || undefined,
      thumbnails: thumbnail ? [thumbnail] : [],
      brandAssets: brandAsset ? [{ label: "", url: brandAsset }] : [],
    };

    const changed: string[] = [];
    if (Number(payout) !== campaign.payout) changed.push("CPM");
    if (b !== (campaign.budget ?? 0)) changed.push("budget");
    if (rules !== (campaign.rules ?? "")) changed.push("rules");
    if (platforms.join(",") !== (campaign.platforms ?? [campaign.platform]).join(","))
      changed.push("platforms");
    if (maxPerClip !== (campaign.maxPayoutPerClip != null ? String(campaign.maxPayoutPerClip) : ""))
      changed.push("max payout/clip");
    if (spendCap !== (campaign.spendCap != null ? String(campaign.spendCap) : ""))
      changed.push("spend cap");
    if (minViews !== (campaign.viewRules?.minViews != null ? String(campaign.viewRules.minViews) : ""))
      changed.push("min views");
    if (JSON.stringify(rights) !== JSON.stringify(campaign.rights ?? emptyRights()))
      changed.push("content rights");
    if (autoReview !== (campaign.approval?.autoReview ?? false)) changed.push("auto-approve");

    const note = changed.length ? `Edited: ${changed.join(", ")}` : "Edited campaign";
    onSave(patch, note);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-5">
          <h3 className="text-lg font-semibold">Edit campaign</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          {needsConfirm && (
            <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-sm text-amber">
              <p className="font-medium">Heads up — this campaign already has submissions.</p>
              <p className="mt-1 text-amber/90">
                Changing key rules (CPM, budget, platforms, rights, etc.) after clips
                are submitted can affect already-submitted work. This change will be
                recorded in the campaign audit log.
              </p>
              <label className="mt-2 flex items-center gap-2 text-amber">
                <input
                  type="checkbox"
                  checked={confirmRules}
                  onChange={(e) => setConfirmRules(e.target.checked)}
                />
                I understand and want to save these changes
              </label>
            </div>
          )}

          <Group title="Basics">
            <Field label="Campaign name">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Category">
              <select className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Objective">
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Drive app installs"
              />
            </Field>
            <Field label="Brief">
              <textarea
                className="input min-h-[70px]"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </Field>
          </Group>

          <Group title="Platforms">
            <div className="flex gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                    platforms.includes(p)
                      ? "border-foreground bg-accent-soft"
                      : "text-muted hover:border-foreground/30"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Payment & budget">
            {submissionCount > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-600">
                CPM and max payout/clip are locked because this campaign has{" "}
                {submissionCount} submission{submissionCount === 1 ? "" : "s"}.
                Existing clips retain the financial terms active when they were submitted.
                To change financial terms, create a new campaign.
              </div>
            )}
            <Field label="CPM (₹ per 1K views)">
              <input
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground ${
                  submissionCount > 0 ? "cursor-not-allowed opacity-60" : ""
                }`}
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                disabled={submissionCount > 0}
              />
              {submissionCount > 0 && (
                <p className="mt-1 text-[11px] text-muted">Locked — clips submitted at this CPM</p>
              )}
            </Field>
            <Field label="Budget (₹)">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={budget} onChange={(e) => setBudget(e.target.value)} />
              {budgetError && <p className="mt-1 text-xs text-red">{budgetError}</p>}
            </Field>
            <Field label="Max payout / clip (₹, optional)">
              <input
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground ${
                  submissionCount > 0 ? "cursor-not-allowed opacity-60" : ""
                }`}
                value={maxPerClip}
                onChange={(e) => setMaxPerClip(e.target.value)}
                disabled={submissionCount > 0}
              />
              {submissionCount > 0 && (
                <p className="mt-1 text-[11px] text-muted">Locked — existing clips capped at this amount</p>
              )}
            </Field>
            <Field label="Spend cap (₹, optional)">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={spendCap} onChange={(e) => setSpendCap(e.target.value)} />
            </Field>
            <Field label="Min verified views (optional)">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={minViews} onChange={(e) => setMinViews(e.target.value)} />
            </Field>
          </Group>

          <Group title="Duration">
            <Field label="Start date">
              <input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End date">
              <input type="date" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field label="Timezone">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. Asia/Kolkata" />
            </Field>
          </Group>

          <Group title="Creative brief">
            <Field label="What to make">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={whatToMake} onChange={(e) => setWhatToMake(e.target.value)} />
            </Field>
            <Field label="Hook">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={hook} onChange={(e) => setHook(e.target.value)} />
            </Field>
            <Field label="CTA">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={cta} onChange={(e) => setCta(e.target.value)} />
            </Field>
            <Field label="Recommended duration">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={recDuration} onChange={(e) => setRecDuration(e.target.value)} />
            </Field>
            <Field label="Style">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={style} onChange={(e) => setStyle(e.target.value)} />
            </Field>
            <Field label="Branding">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={branding} onChange={(e) => setBranding(e.target.value)} />
            </Field>
          </Group>

          <Group title="Rules">
            <Field label="Campaign rules">
              <textarea
                className="input min-h-[70px]"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                placeholder="What clippers must / must not do"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoReview} onChange={(e) => setAutoReview(e.target.checked)} />
              Auto-approve submissions
            </label>
            <Field label="Review time (optional)">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={reviewTime} onChange={(e) => setReviewTime(e.target.value)} placeholder="e.g. 24h" />
            </Field>
          </Group>

          <Group title="Content rights">
            <div className="grid grid-cols-2 gap-2">
              {(["ads", "social", "website", "other"] as const).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={rights[key]}
                    onChange={(e) => setRights((r) => ({ ...r, [key]: e.target.checked }))}
                  />
                  {key}
                </label>
              ))}
            </div>
            {rights.other && (
              <Field label="Other rights detail">
                <input
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                  value={rights.otherText ?? ""}
                  onChange={(e) => setRights((r) => ({ ...r, otherText: e.target.value }))}
                />
              </Field>
            )}
          </Group>

          <Group title="Source assets">
            <Field label="Source video link">
              <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground" value={sourceLink} onChange={(e) => setSourceLink(e.target.value)} />
            </Field>
          </Group>

          <Group title="Thumbnail">
            <div className="col-span-full">
              {thumbnail ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnail} alt="Thumbnail" className="h-24 w-40 rounded-lg border object-cover" />
                  <button
                    onClick={() => setThumbnail(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-foreground p-0.5 text-background"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => thumbInputRef.current?.click()}
                  disabled={thumbnailUploading}
                  className="flex h-24 w-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted hover:border-foreground/30 disabled:opacity-50"
                >
                  {thumbnailUploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                  {thumbnailUploading ? "Uploading..." : "Upload thumbnail"}
                </button>
              )}
              <input
                ref={thumbInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleThumbUpload}
              />
            </div>
          </Group>

          <Group title="Brand asset">
            <div className="col-span-full">
              {brandAsset ? (
                <div className="relative inline-block">
                  {/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(brandAsset) ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={brandAsset} alt="Brand asset" className="h-24 w-40 rounded-lg border object-cover" />
                  ) : (
                    <div className="flex h-24 w-40 items-center gap-2 rounded-lg border bg-accent-soft px-3 text-sm">
                      <FileText size={16} className="shrink-0 text-muted" />
                      <span className="truncate text-xs text-muted">Uploaded asset</span>
                    </div>
                  )}
                  <button
                    onClick={() => setBrandAsset(null)}
                    className="absolute -right-2 -top-2 rounded-full bg-foreground p-0.5 text-background"
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => brandInputRef.current?.click()}
                  disabled={brandAssetUploading}
                  className="flex h-24 w-40 items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted hover:border-foreground/30 disabled:opacity-50"
                >
                  {brandAssetUploading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {brandAssetUploading ? "Uploading..." : "Upload asset"}
                </button>
              )}
              <input
                ref={brandInputRef}
                type="file"
                className="hidden"
                onChange={handleBrandAssetUpload}
              />
            </div>
          </Group>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <button onClick={onClose} className="rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent-soft">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={needsConfirm && !confirmRules}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
