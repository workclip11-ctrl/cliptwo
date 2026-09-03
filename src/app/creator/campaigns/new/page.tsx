"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  X,
  Save,
  Eye,
  Send,
  Upload,
  FileVideo,
  ImageIcon,
  File,
  Link as LinkIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { uploadCampaignFile } from "@/lib/upload";
import type {
  Campaign,
  CampaignApproval,
  CampaignRights,
  CampaignSourceAsset,
  CampaignStatus,
  Platform,
} from "@/lib/types";

const STEPS = [
  "Basic information",
  "Source content",
  "Platforms",
  "Payment",
  "Duration",
  "Creative brief",
  "Rules",
  "Approval rules",
  "Content rights",
  "Review",
];

const PLATFORM_OPTIONS: { label: string; value: Platform }[] = [
  { label: "Instagram", value: "Instagram" },
  { label: "YouTube", value: "YouTube" },
  { label: "Kick", value: "Kick" },
];

const CATEGORIES = [
  "Tech",
  "Gaming",
  "Finance",
  "Comedy",
  "Fitness",
  "Podcast",
  "Food",
  "Travel",
  "Beauty",
  "Other",
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint && <span className="ml-1 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground";

export default function NewCampaignWizard() {
  const router = useRouter();
  const { addCampaign } = useStore();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState("");

  // Step 1
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 — source content
  const [sourceType, setSourceType] = useState<"link" | "file">("link");
  const [sourceLink, setSourceLink] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState("");
  const [sourceUploading, setSourceUploading] = useState(false);

  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState("");
  const [thumbUploading, setThumbUploading] = useState(false);

  const [brandFile, setBrandFile] = useState<File | null>(null);
  const [brandPreview, setBrandPreview] = useState("");
  const [brandUploading, setBrandUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 3
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  // Step 4
  const [payout, setPayout] = useState("");
  const [budget, setBudget] = useState("");
  const [maxPayoutPerClip, setMaxPayoutPerClip] = useState("");
  const [minViews, setMinViews] = useState("");
  const [spendCap, setSpendCap] = useState("");

  // Step 5
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timezone, setTimezone] = useState("");

  // Step 6
  const [whatToMake, setWhatToMake] = useState("");
  const [recommendedDuration, setRecommendedDuration] = useState("");
  const [hook, setHook] = useState("");
  const [captionReq, setCaptionReq] = useState("");
  const [cta, setCta] = useState("");
  const [style, setStyle] = useState("");

  // Step 7
  const [dos, setDos] = useState<string[]>([""]);
  const [donts, setDonts] = useState<string[]>([""]);

  // Step 8
  const [autoReview, setAutoReview] = useState(false);
  const [reviewTime, setReviewTime] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([""]);

  // Step 9
  const [rightsAds, setRightsAds] = useState(true);
  const [rightsSocial, setRightsSocial] = useState(true);
  const [rightsWebsite, setRightsWebsite] = useState(false);
  const [rightsOther, setRightsOther] = useState(false);
  const [rightsOtherText, setRightsOtherText] = useState("");

  function togglePlatform(value: Platform) {
    setPlatforms((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
  }

  function goStep(n: number) {
    setErrors({});
    setStep(n);
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Campaign name is required.";
    if (!category) e.category = "Pick a category.";
    if (!objective.trim()) e.objective = "Objective is required.";
    if (!description.trim()) e.description = "Description is required.";
    if (platforms.length === 0) e.platforms = "Select at least one platform.";
    const cp = Number(payout);
    if (!payout || isNaN(cp) || cp <= 0) e.payout = "Enter a CPM greater than 0.";
    const b = Number(budget);
    if (!budget || isNaN(b) || b <= 0) e.budget = "Enter a budget greater than 0.";
    if (!startDate) e.startDate = "Start date is required.";
    if (!endDate) e.endDate = "End date is required.";
    if (startDate && endDate && new Date(endDate) < new Date(startDate))
      e.endDate = "End date must be after the start date.";
    if (!whatToMake.trim()) e.whatToMake = "Describe what to make.";
    if (dos.map((d) => d.trim()).filter(Boolean).length === 0)
      e.dos = "Add at least one DO rule.";
    if (donts.map((d) => d.trim()).filter(Boolean).length === 0)
      e.donts = "Add at least one DON'T rule.";
    return e;
  }

  function buildCampaign(uploaded: {
    sourceAssets: CampaignSourceAsset[];
    thumbnails: string[];
    brandAssets: CampaignSourceAsset[];
  }): Omit<Campaign, "id" | "createdAt" | "status"> {
    const cleanDos = dos.map((d) => d.trim()).filter(Boolean);
    const cleanDonts = donts.map((d) => d.trim()).filter(Boolean);
    const cleanReject = rejectionReasons.map((r) => r.trim()).filter(Boolean);
    const approval: CampaignApproval = {
      afterSubmission: autoReview
        ? "Auto-approved on submit once view thresholds are met."
        : "Manual review by the brand team.",
      reviewTime: reviewTime.trim() || undefined,
      criteria: "",
      rejectionReasons: cleanReject,
      appeal: "Reply to the decision email within 7 days.",
      autoReview,
    };
    const rights: CampaignRights = {
      ads: rightsAds,
      social: rightsSocial,
      website: rightsWebsite,
      other: rightsOther,
      otherText: rightsOther ? rightsOtherText.trim() || undefined : undefined,
    };
    return {
      title: title.trim(),
      creator: user?.name ?? user?.email ?? "Creator",
      brief: description.trim(),
      platform: platforms[0] ?? "Instagram",
      payout: Number(payout) || 0,
      niche: category,
      budget: Number(budget) || 0,
      daysLeft: 30,
      sourceLink: sourceType === "link" ? sourceLink.trim() : "",
      rules: "",
      category,
      platforms,
      objective: objective.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      maxPayoutPerClip: maxPayoutPerClip ? Number(maxPayoutPerClip) : undefined,
      recommendedDuration: recommendedDuration.trim() || undefined,
      hook: hook.trim() || undefined,
      captionReq: captionReq.trim() || undefined,
      aspectRatio: "9:16 vertical",
      cta: cta.trim() || undefined,
      branding: style.trim() || undefined,
      doList: cleanDos,
      dontList: cleanDonts,
      sourceAssets: uploaded.sourceAssets,
      exampleClips: [],
      viewRules: {
        minViews: minViews ? Number(minViews) : undefined,
      },
      approval,
      thumbnails: uploaded.thumbnails,
      brandAssets: uploaded.brandAssets,
      spendCap: spendCap ? Number(spendCap) : undefined,
      timezone: timezone.trim() || undefined,
      whatToMake: whatToMake.trim() || undefined,
      style: style.trim() || undefined,
      rights,
      verified: false,
    };
  }

  async function submit(status: CampaignStatus) {
    if (isSubmitting) return;
    if (status === "open") {
      const e = validate();
      setErrors(e);
      if (Object.keys(e).length > 0) {
        const firstStep = stepWithError(e);
        setStep(firstStep);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Upload files to storage before creating the campaign
      const uploadedSourceAssets: CampaignSourceAsset[] = [];
      const uploadedThumbnails: string[] = [];
      const uploadedBrandAssets: CampaignSourceAsset[] = [];

      if (sourceType === "file" && sourceFile) {
        setSourceUploading(true);
        const url = await uploadCampaignFile("source", sourceFile);
        setSourceUploading(false);
        if (url) uploadedSourceAssets.push({ label: sourceFile.name, url });
      } else if (sourceType === "link" && sourceLink.trim()) {
        uploadedSourceAssets.push({ label: "", url: sourceLink.trim() });
      }

      if (thumbFile) {
        setThumbUploading(true);
        const url = await uploadCampaignFile("thumbnail", thumbFile);
        setThumbUploading(false);
        if (url) uploadedThumbnails.push(url);
      }

      if (brandFile) {
        setBrandUploading(true);
        const url = await uploadCampaignFile("brand", brandFile);
        setBrandUploading(false);
        if (url) uploadedBrandAssets.push({ label: brandFile.name, url });
      }

      // Build and submit the campaign with the uploaded URLs
      addCampaign(
        buildCampaign({
          sourceAssets: uploadedSourceAssets,
          thumbnails: uploadedThumbnails,
          brandAssets: uploadedBrandAssets,
        }),
        status,
      );
      setSavedMsg(
        status === "draft"
          ? "Draft saved. You can finish and publish it later."
          : "Campaign published.",
      );
      setTimeout(() => router.push("/creator/campaigns"), 900);
    } catch {
      setIsSubmitting(false);
    }
  }

  function stepWithError(e: Record<string, string>): number {
    if (e.title || e.category || e.objective || e.description) return 0;
    if (e.platforms) return 2;
    if (e.payout || e.budget) return 3;
    if (e.startDate || e.endDate) return 4;
    if (e.whatToMake) return 5;
    if (e.dos || e.donts) return 6;
    return 0;
  }

  const cpm = Number(payout) || 0;
  const bud = Number(budget) || 0;
  const potentialViews = cpm > 0 ? Math.round((bud / cpm) * 1000) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-xs text-muted">Step {step + 1} of {STEPS.length}</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create campaign</h1>
        <p className="mt-1 text-sm text-muted">
          A {STEPS[step].toLowerCase()} wizard that stores everything in your
          database.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => goStep(i)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              i === step
                ? "border-foreground bg-accent-soft"
                : "text-muted hover:text-foreground"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {savedMsg && (
        <div className="rounded-xl border border-green/30 bg-accent-soft p-3 text-sm text-green">
          {savedMsg}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6">
        {/* STEP 1 */}
        {step === 0 && (
          <div className="space-y-4">
            <Field label="Campaign name">
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Launch teaser for our new app"
              />
              {errors.title && <p className="mt-1 text-xs text-red">{errors.title}</p>}
            </Field>
            <Field label="Category">
              <select
                className={inputCls}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-red">{errors.category}</p>
              )}
            </Field>
            <Field label="Campaign objective">
              <input
                className={inputCls}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g. Drive pre-launch awareness"
              />
              {errors.objective && (
                <p className="mt-1 text-xs text-red">{errors.objective}</p>
              )}
            </Field>
            <Field label="Description">
              <textarea
                className={inputCls + " resize-none"}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this campaign about?"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red">{errors.description}</p>
              )}
            </Field>
          </div>
        )}

        {/* STEP 2 — Source content */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Source videos / files */}
            <div>
              <p className="text-sm font-medium">Source videos / files</p>
              <p className="text-xs text-muted">
                Paste a link to the source footage creators should cut from.
              </p>

              {/* Mode toggle */}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSourceType("link")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    sourceType === "link"
                      ? "border-accent bg-accent-soft"
                      : "hover:bg-background"
                  }`}
                >
                  <LinkIcon size={13} /> Paste link
                </button>
                <button
                  type="button"
                  onClick={() => setSourceType("file")}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    sourceType === "file"
                      ? "border-accent bg-accent-soft"
                      : "hover:bg-background"
                  }`}
                >
                  <Upload size={13} /> Upload file
                </button>
              </div>

              {/* Link input */}
              {sourceType === "link" && (
                <div className="mt-3">
                  <input
                    className={inputCls}
                    value={sourceLink}
                    onChange={(e) => setSourceLink(e.target.value)}
                    placeholder="https://drive.google.com/…"
                  />
                </div>
              )}

              {/* File input */}
              {sourceType === "file" && (
                <div className="mt-3">
                  {sourceFile ? (
                    <div className="flex items-center gap-3 rounded-lg border bg-accent-soft p-3">
                      <FileVideo size={16} className="shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{sourceFile.name}</span>
                      <span className="text-xs text-muted">
                        {(sourceFile.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      {sourceUploading && (
                        <span className="text-xs text-muted">Uploading…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSourceFile(null);
                          setSourcePreview("");
                        }}
                        className="rounded p-0.5 text-muted hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted hover:border-foreground/30 hover:text-foreground">
                      <Upload size={16} />
                      Choose a video file
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setSourceFile(f);
                            setSourcePreview(URL.createObjectURL(f));
                          }
                        }}
                      />
                    </label>
                  )}
                  {sourcePreview && sourceFile?.type.startsWith("video/") && (
                    <video
                      src={sourcePreview}
                      controls
                      className="mt-2 max-h-40 w-full rounded-lg"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="border-t" />

            {/* Thumbnail */}
            <div>
              <p className="text-sm font-medium">Thumbnail</p>
              <p className="text-xs text-muted">Upload one thumbnail image.</p>
              <div className="mt-3">
                {thumbFile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border bg-accent-soft p-3">
                      <ImageIcon size={16} className="shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{thumbFile.name}</span>
                      {thumbUploading && (
                        <span className="text-xs text-muted">Uploading…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setThumbFile(null);
                          setThumbPreview("");
                        }}
                        className="rounded p-0.5 text-muted hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {thumbPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbPreview}
                        alt="Thumbnail preview"
                        className="h-24 w-24 rounded-lg object-cover"
                      />
                    )}
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted hover:border-foreground/30 hover:text-foreground">
                    <Upload size={16} />
                    Upload thumbnail
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setThumbFile(f);
                          setThumbPreview(URL.createObjectURL(f));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="border-t" />

            {/* Brand asset / logo */}
            <div>
              <p className="text-sm font-medium">Brand assets / logos</p>
              <p className="text-xs text-muted">
                Upload one brand asset or logo.
              </p>
              <div className="mt-3">
                {brandFile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border bg-accent-soft p-3">
                      <File size={16} className="shrink-0 text-muted" />
                      <span className="flex-1 truncate text-sm">{brandFile.name}</span>
                      {brandUploading && (
                        <span className="text-xs text-muted">Uploading…</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setBrandFile(null);
                          setBrandPreview("");
                        }}
                        className="rounded p-0.5 text-muted hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {brandPreview && brandFile?.type.startsWith("image/") && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={brandPreview}
                        alt="Brand asset preview"
                        className="h-24 w-24 rounded-lg object-contain"
                      />
                    )}
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted hover:border-foreground/30 hover:text-foreground">
                    <Upload size={16} />
                    Upload asset
                    <input
                      type="file"
                      accept="image/*,.pdf,.ai,.eps,.svg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setBrandFile(f);
                          if (f.type.startsWith("image/")) {
                            setBrandPreview(URL.createObjectURL(f));
                          }
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Platforms</p>
            {errors.platforms && (
              <p className="text-xs text-red">{errors.platforms}</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {PLATFORM_OPTIONS.map((p) => {
                const on = platforms.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePlatform(p.value)}
                    className={`flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium ${
                      on ? "border-accent bg-accent-soft" : "hover:bg-background"
                    }`}
                  >
                    {p.label}
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        on ? "border-accent bg-accent text-white" : "text-muted"
                      }`}
                    >
                      {on && <Check size={12} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 3 && (
          <div className="space-y-4">
            <Field label="CPM — payout per 1,000 views" hint="₹">
              <input
                className={inputCls}
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                inputMode="numeric"
                placeholder="220"
              />
              {errors.payout && (
                <p className="mt-1 text-xs text-red">{errors.payout}</p>
              )}
            </Field>
            <Field label="Total campaign budget" hint="₹">
              <input
                className={inputCls}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                inputMode="numeric"
                placeholder="40000"
              />
              {errors.budget && (
                <p className="mt-1 text-xs text-red">{errors.budget}</p>
              )}
            </Field>
            <Field label="Maximum payout per clip" hint="optional ₹">
              <input
                className={inputCls}
                value={maxPayoutPerClip}
                onChange={(e) => setMaxPayoutPerClip(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Minimum views" hint="optional">
              <input
                className={inputCls}
                value={minViews}
                onChange={(e) => setMinViews(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Campaign-wide spending cap" hint="optional ₹">
              <input
                className={inputCls}
                value={spendCap}
                onChange={(e) => setSpendCap(e.target.value)}
                inputMode="numeric"
              />
            </Field>

            <div className="rounded-xl bg-background p-4 text-sm">
              <p className="font-medium">Live estimate</p>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-muted">
                <div>
                  Budget <span className="font-mono text-foreground">{rup(bud)}</span>
                </div>
                <div>
                  → Potential views{" "}
                  <span className="font-mono text-foreground">
                    {potentialViews.toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  → Estimated payout{" "}
                  <span className="font-mono text-foreground">{rup(bud)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {step === 4 && (
          <div className="space-y-4">
            <Field label="Start date">
              <input
                type="date"
                className={inputCls}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {errors.startDate && (
                <p className="mt-1 text-xs text-red">{errors.startDate}</p>
              )}
            </Field>
            <Field label="End date">
              <input
                type="date"
                className={inputCls}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {errors.endDate && (
                <p className="mt-1 text-xs text-red">{errors.endDate}</p>
              )}
            </Field>
            <Field label="Time zone">
              <input
                className={inputCls}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. IST (Asia/Kolkata)"
              />
            </Field>
          </div>
        )}

        {/* STEP 6 */}
        {step === 5 && (
          <div className="space-y-4">
            <Field label="What to make">
              <textarea
                className={inputCls + " resize-none"}
                rows={3}
                value={whatToMake}
                onChange={(e) => setWhatToMake(e.target.value)}
                placeholder="e.g. Turn the keynote into punchy 20s hooks."
              />
              {errors.whatToMake && (
                <p className="mt-1 text-xs text-red">{errors.whatToMake}</p>
              )}
            </Field>
            <Field label="Recommended duration" hint="optional">
              <input
                className={inputCls}
                value={recommendedDuration}
                onChange={(e) => setRecommendedDuration(e.target.value)}
                placeholder="15–30s"
              />
            </Field>
            <Field label="Hook requirements" hint="optional">
              <input
                className={inputCls}
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                placeholder="Open with the hook in the first 3 seconds."
              />
            </Field>
            <Field label="Caption requirements" hint="optional">
              <input
                className={inputCls}
                value={captionReq}
                onChange={(e) => setCaptionReq(e.target.value)}
                placeholder="English caption + 3 hashtags."
              />
            </Field>
            <Field label="Call to action" hint="optional">
              <input
                className={inputCls}
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                placeholder="Link in bio to install the app."
              />
            </Field>
            <Field label="Style instructions" hint="optional">
              <textarea
                className={inputCls + " resize-none"}
                rows={2}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="Cinematic grade, stable shots, burnt-in subtitles."
              />
            </Field>
          </div>
        )}

        {/* STEP 7 */}
        {step === 6 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-green">DO</p>
              {errors.dos && <p className="text-xs text-red">{errors.dos}</p>}
              <div className="mt-2 space-y-2">
                {dos.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputCls}
                      value={d}
                      placeholder="e.g. Keep the hook intact"
                      onChange={(e) =>
                        setDos((prev) =>
                          prev.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setDos((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded-md border px-2 text-muted"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDos((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Plus size={12} /> Add DO
                </button>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-red">DON&apos;T</p>
              {errors.donts && <p className="text-xs text-red">{errors.donts}</p>}
              <div className="mt-2 space-y-2">
                {donts.map((d, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputCls}
                      value={d}
                      placeholder="e.g. No watermarks"
                      onChange={(e) =>
                        setDonts((prev) =>
                          prev.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDonts((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="rounded-md border px-2 text-muted"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDonts((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Plus size={12} /> Add DON&apos;T
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 8 */}
        {step === 7 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoReview}
                onChange={(e) => setAutoReview(e.target.checked)}
                className="h-4 w-4"
              />
              Auto-approve clips (manual review off)
            </label>
            <Field label="Expected review time" hint="optional">
              <input
                className={inputCls}
                value={reviewTime}
                onChange={(e) => setReviewTime(e.target.value)}
                placeholder="Within 48 hours"
              />
            </Field>
            <div>
              <p className="text-sm font-medium">Rejection rules</p>
              <div className="mt-2 space-y-2">
                {rejectionReasons.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={inputCls}
                      value={r}
                      placeholder="e.g. Watermark"
                      onChange={(e) =>
                        setRejectionReasons((prev) =>
                          prev.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRejectionReasons((prev) =>
                          prev.filter((_, j) => j !== i),
                        )
                      }
                      className="rounded-md border px-2 text-muted"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRejectionReasons((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  <Plus size={12} /> Add rejection reason
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 9 */}
        {step === 8 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              What rights does the creator receive over submitted clips?
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rightsAds}
                onChange={(e) => setRightsAds(e.target.checked)}
                className="h-4 w-4"
              />
              May be reused in Ads
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rightsSocial}
                onChange={(e) => setRightsSocial(e.target.checked)}
                className="h-4 w-4"
              />
              May be reused on Social media
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rightsWebsite}
                onChange={(e) => setRightsWebsite(e.target.checked)}
                className="h-4 w-4"
              />
              May be reused on the Website
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rightsOther}
                onChange={(e) => setRightsOther(e.target.checked)}
                className="h-4 w-4"
              />
              Other marketing
            </label>
            {rightsOther && (
              <Field label="Describe other marketing use">
                <input
                  className={inputCls}
                  value={rightsOtherText}
                  onChange={(e) => setRightsOtherText(e.target.value)}
                  placeholder="e.g. Email newsletters"
                />
              </Field>
            )}
          </div>
        )}

        {/* STEP 10 */}
        {step === 9 && (
          <div className="space-y-4 text-sm">
            <p className="font-medium">Review your campaign</p>
            <ReviewRow label="Name" value={title} />
            <ReviewRow label="Category" value={category} />
            <ReviewRow label="Objective" value={objective} />
            <ReviewRow label="Description" value={description} />
            <ReviewRow
              label="Source"
              value={
                sourceType === "file"
                  ? sourceFile?.name ?? "—"
                  : sourceLink || "—"
              }
            />
            <ReviewRow
              label="Thumbnail"
              value={thumbFile?.name ?? "—"}
            />
            <ReviewRow
              label="Brand asset"
              value={brandFile?.name ?? "—"}
            />
            <ReviewRow
              label="Platforms"
              value={platforms
                .map((p) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label)
                .join(", ")}
            />
            <ReviewRow label="CPM" value={rup(cpm)} />
            <ReviewRow label="Budget" value={rup(bud)} />
            <ReviewRow
              label="Max / min / cap"
              value={`${maxPayoutPerClip || "—"} / ${minViews || "—"} / ${
                spendCap || "—"
              }`}
            />
            <ReviewRow
              label="Duration"
              value={`${startDate || "—"} → ${endDate || "—"} (${timezone || "—"})`}
            />
            <ReviewRow label="What to make" value={whatToMake} />
            <ReviewRow label="DO" value={dos.filter(Boolean).join("; ")} />
            <ReviewRow label="DON&apos;T" value={donts.filter(Boolean).join("; ")} />
            <ReviewRow
              label="Review"
              value={`${autoReview ? "Auto" : "Manual"}${
                reviewTime ? ` · ${reviewTime}` : ""
              }`}
            />
            <ReviewRow
              label="Rights"
              value={
                [
                  rightsAds && "Ads",
                  rightsSocial && "Social",
                  rightsWebsite && "Website",
                  rightsOther && `Other${rightsOtherText ? ` (${rightsOtherText})` : ""}`,
                ]
                  .filter(Boolean)
                  .join(", ") || "None"
              }
            />
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => goStep(Math.max(0, step - 1))}
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          <ArrowLeft size={14} /> Prev
        </button>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => submit("draft")}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            <Save size={14} /> {isSubmitting ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => goStep(9)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
          >
            <Eye size={14} /> Preview
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => goStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit("open")}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Send size={14} /> {isSubmitting ? "Publishing…" : "Publish campaign"}
            </button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        A campaign only becomes active (Open) after validation passes. Drafts are
        saved and can be finished later.
      </p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-3 border-b py-2">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      <span className="font-medium">{value ? value : "—"}</span>
    </div>
  );
}
