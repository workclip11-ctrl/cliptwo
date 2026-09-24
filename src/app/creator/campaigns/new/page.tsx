"use client";

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Save,
  Send,
  Upload,
  FileVideo,
  ImageIcon,
  File,
  Link as LinkIcon,
  CreditCard,
  Clock,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { uploadCampaignFile } from "@/lib/upload";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Campaign,
  CampaignRights,
  CampaignSourceAsset,
  CampaignStatus,
  Platform,
} from "@/lib/types";

declare global {
  interface Window {
    Cashfree?: (config: { mode: string }) => {
      checkout: (options: { paymentSessionId: string }) => void;
    };
  }
}

const STEPS = [
  "Basic information",
  "Source content",
  "Platforms",
  "Payment",
  "Duration",
  "Content rights",
  "Review",
];

const PLATFORM_OPTIONS: { label: string; value: Platform; disabled?: boolean }[] = [
  { label: "Instagram", value: "Instagram" },
  { label: "YouTube", value: "YouTube" },
  { label: "Kick", value: "Kick", disabled: true },
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

function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  function handlePointerDown(e: React.PointerEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    if (typeof input.showPicker === "function") {
      e.preventDefault();
      try {
        input.showPicker();
      } catch {
        // Fall back to normal native behavior if showPicker cannot be invoked.
      }
    }
  }

  return (
    <div className="block text-sm">
      <span id={labelId} className="font-medium">
        {label}
      </span>
      <div className="mt-1.5">
        <div className="cursor-pointer rounded-lg border bg-background focus-within:border-foreground">
          <input
            ref={inputRef}
            type="date"
            aria-labelledby={labelId}
            className="block w-full cursor-pointer border-0 bg-transparent px-3 py-2 text-sm outline-none"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPointerDown={handlePointerDown}
          />
        </div>
        {error && <p className="mt-1 text-xs text-red">{error}</p>}
      </div>
    </div>
  );
}

export default function NewCampaignWizard() {
  const router = useRouter();
  const { addCampaign } = useStore();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedMsg, setSavedMsg] = useState("");

  // Step 1 — Basic information
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 — Source content
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

  // Payment flow state
  const [paymentPhase, setPaymentPhase] = useState<
    "none" | "showing" | "processing" | "polling" | "submitted"
  >("none");
  const [createdCampaignId, setCreatedCampaignId] = useState<string>("");
  const [paymentError, setPaymentError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Step 3 — Platforms
  const [platforms, setPlatforms] = useState<Platform[]>([]);

  // Step 4 — Payment
  const [payout, setPayout] = useState("");
  const [budget, setBudget] = useState("");
  const [maxPayoutPerClip, setMaxPayoutPerClip] = useState("");

  // Step 5 — Duration
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [recommendedDuration, setRecommendedDuration] = useState("");

  // Step 6 — Content rights
  const [rightsAds, setRightsAds] = useState(true);
  const [rightsSocial, setRightsSocial] = useState(true);
  const [rightsWebsite, setRightsWebsite] = useState(false);
  const [rightsOther, setRightsOther] = useState(false);
  const [rightsOtherText, setRightsOtherText] = useState("");

  function togglePlatform(value: Platform) {
    if (value === "Kick") return;
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
    return e;
  }

  function buildCampaign(uploaded: {
    sourceAssets: CampaignSourceAsset[];
    thumbnails: string[];
    brandAssets: CampaignSourceAsset[];
  }): Omit<Campaign, "id" | "createdAt" | "status"> {
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
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      maxPayoutPerClip: maxPayoutPerClip ? Number(maxPayoutPerClip) : undefined,
      recommendedDuration: recommendedDuration.trim() || undefined,
      sourceAssets: uploaded.sourceAssets,
      exampleClips: [],
      thumbnails: uploaded.thumbnails,
      brandAssets: uploaded.brandAssets,
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
      const tempCampaignId = crypto.randomUUID();
      const uploadedSourceAssets: CampaignSourceAsset[] = [];
      const uploadedThumbnails: string[] = [];
      const uploadedBrandAssets: CampaignSourceAsset[] = [];

      if (sourceType === "file" && sourceFile) {
        setSourceUploading(true);
        const url = await uploadCampaignFile("source", tempCampaignId, sourceFile);
        setSourceUploading(false);
        if (url) uploadedSourceAssets.push({ label: sourceFile.name, url });
      } else if (sourceType === "link" && sourceLink.trim()) {
        uploadedSourceAssets.push({ label: "", url: sourceLink.trim() });
      }

      if (thumbFile) {
        setThumbUploading(true);
        const url = await uploadCampaignFile("thumbnail", tempCampaignId, thumbFile);
        setThumbUploading(false);
        if (url) uploadedThumbnails.push(url);
      }

      if (brandFile) {
        setBrandUploading(true);
        const url = await uploadCampaignFile("brand", tempCampaignId, brandFile);
        setBrandUploading(false);
        if (url) uploadedBrandAssets.push({ label: brandFile.name, url });
      }

      const createdId = await addCampaign(
        buildCampaign({
          sourceAssets: uploadedSourceAssets,
          thumbnails: uploadedThumbnails,
          brandAssets: uploadedBrandAssets,
        }),
        status === "open" ? "draft" : status,
        tempCampaignId,
      );

      if (createdId) {
        if (status === "open") {
          setCreatedCampaignId(createdId);
          setPaymentPhase("showing");
        } else {
          setSavedMsg("Draft saved. You can finish and publish it later.");
          setTimeout(() => router.push("/creator/campaigns"), 900);
        }
      }
    } catch (err) {
      console.error("Campaign creation failed:", err);
      setErrors({
        submit: err instanceof Error ? err.message : "Campaign creation failed. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const CASHFREE_SCRIPT_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

  function loadCashfreeScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.Cashfree) { resolve(true); return; }
      const existing = document.querySelector(`script[src="${CASHFREE_SCRIPT_URL}"]`);
      if (existing) {
        const check = () => { if (window.Cashfree) resolve(true); else setTimeout(check, 100); };
        check();
        return;
      }
      const script = document.createElement("script");
      script.src = CASHFREE_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        const check = () => { if (window.Cashfree) resolve(true); else setTimeout(check, 100); };
        check();
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  const startPaymentPolling = useCallback((campId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollCountRef.current = 0;
    setPaymentPhase("polling");

    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { if (pollRef.current) clearInterval(pollRef.current); return; }
      pollCountRef.current += 1;
      if (!isSupabaseConfigured) { if (pollRef.current) clearInterval(pollRef.current); return; }
      const { data } = await supabase
        .from("campaigns")
        .select("launch_payment_status")
        .eq("id", campId)
        .single();
      if (!mountedRef.current) return;
      const status = data?.launch_payment_status;
      if (status === "verified") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentPhase("submitted");
      } else if (status === "rejected") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentPhase("showing");
        setPaymentError("Payment was rejected. Please try again.");
      } else if (pollCountRef.current >= 20) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentPhase("showing");
        setPaymentError("Payment verification is taking longer than expected. Please check again shortly.");
      }
    }, 3000);
  }, []);

  async function submitPayment() {
    if (!createdCampaignId || paymentPhase === "processing" || paymentPhase === "polling") return;
    setPaymentError("");
    setPaymentPhase("processing");

    try {
      const scriptLoaded = await loadCashfreeScript();
      if (!scriptLoaded || !window.Cashfree) {
        throw new Error("Payment gateway could not be loaded. Please try again.");
      }

      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers = { ...headers, Authorization: `Bearer ${token}` };
      }

      const res = await fetch("/api/campaigns/payment/cashfree/create-order", {
        method: "POST",
        headers,
        body: JSON.stringify({ campaignId: createdCampaignId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create payment order");
      if (!data.payment_session_id) throw new Error("Invalid response from payment gateway");

      const cashfree = window.Cashfree({
        mode: "sandbox",
      });
      cashfree.checkout({
        paymentSessionId: data.payment_session_id,
      });

      startPaymentPolling(createdCampaignId);
    } catch (err) {
      setPaymentPhase("showing");
      setPaymentError(
        err instanceof Error ? err.message : "Payment failed. Please try again.",
      );
    }
  }

  function stepWithError(e: Record<string, string>): number {
    if (e.title || e.category || e.description) return 0;
    if (e.platforms) return 2;
    if (e.payout || e.budget) return 3;
    if (e.startDate || e.endDate) return 4;
    return 0;
  }

  const cpm = Number(payout) || 0;
  const bud = Number(budget) || 0;
  const potentialViews = cpm > 0 ? Math.round((bud / cpm) * 1000) : 0;

  // ── Payment screens ─────────────────────────────────────────────────────
  if (paymentPhase === "showing" || paymentPhase === "processing" || paymentPhase === "polling") {
    const budgetRupees = Number(budget) || 0;
    const platformFeeRupees = Math.floor(budgetRupees * 0.10);
    const totalPayableRupees = budgetRupees + platformFeeRupees;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <button
          type="button"
          onClick={() => setPaymentPhase("none")}
          disabled={paymentPhase === "processing" || paymentPhase === "polling"}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft size={14} /> Back to campaign
        </button>

        <div className="rounded-2xl border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <CreditCard size={24} className="text-accent" />
            <div>
              <h2 className="text-lg font-semibold">Campaign Launch Payment</h2>
              <p className="text-sm text-muted">
                Pay the platform fee to publish your campaign
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border bg-background p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Campaign budget</span>
              <span className="font-mono font-medium">{rup(budgetRupees)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Cliptwo platform fee (10%)</span>
              <span className="font-mono font-medium">{rup(platformFeeRupees)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-medium">Total to pay</span>
              <span className="font-mono text-lg font-semibold">{rup(totalPayableRupees)}</span>
            </div>
          </div>

          <p className="text-xs text-muted">
            To publish this campaign, a 10% Cliptwo platform fee is charged in
            addition to your campaign budget. Your {rup(budgetRupees)} campaign
            budget remains fully allocated for clipper campaign payouts.
          </p>

          {(paymentPhase === "processing" || paymentPhase === "polling") && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 size={24} className="animate-spin text-muted" />
              <p className="text-sm text-muted">
                {paymentPhase === "processing"
                  ? "Opening payment checkout..."
                  : "Confirming your payment..."}
              </p>
              {paymentPhase === "polling" && (
                <p className="text-xs text-muted">
                  This may take a few moments. You can safely leave this page.
                </p>
              )}
            </div>
          )}

          {paymentPhase === "showing" && paymentError && (
            <p className="text-sm text-red">{paymentError}</p>
          )}

          {paymentPhase === "showing" && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPaymentPhase("none")}
                className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent-soft"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPayment}
                className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Continue to payment
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (paymentPhase === "submitted") {
    const budgetRupees = Number(budget) || 0;
    const platformFeeRupees = Math.floor(budgetRupees * 0.10);
    const totalPayableRupees = budgetRupees + platformFeeRupees;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border bg-card p-6 space-y-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-accent/10 p-3">
              <Clock size={32} className="text-accent" />
            </div>
            <h2 className="text-lg font-semibold">Payment Processing</h2>
            <p className="text-sm text-muted">
              Cashfree has received your payment. We&apos;re confirming it. Your
              campaign will be published after verification.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border bg-background p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted">Amount</span>
              <span className="font-mono font-medium">{rup(totalPayableRupees)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Status</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                <Clock size={12} /> Processing
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/creator/campaigns")}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Go to My Campaigns
          </button>
        </div>
      </div>
    );
  }

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

      {errors.submit && (
        <div className="rounded-xl border border-red/30 bg-red-soft p-3 text-sm text-red">
          {errors.submit}
        </div>
      )}

      <div className="rounded-2xl border bg-card p-6">
        {/* STEP 1 — Basic information */}
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

        {/* STEP 3 — Platforms */}
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
                    disabled={p.disabled}
                    onClick={() => togglePlatform(p.value)}
                    className={`flex items-center justify-between rounded-xl border p-4 text-left text-sm font-medium ${
                      p.disabled
                        ? "cursor-not-allowed border-border/40 text-muted/50"
                        : on
                          ? "border-accent bg-accent-soft"
                          : "hover:bg-background"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {p.label}
                      {p.disabled && <span className="text-[11px] text-muted/50">(coming soon)</span>}
                    </span>
                    {!p.disabled && (
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          on ? "border-accent bg-accent text-white" : "text-muted"
                        }`}
                      >
                        {on && <Check size={12} />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4 — Payment */}
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

        {/* STEP 5 — Duration */}
        {step === 4 && (
          <div className="space-y-4">
            <DateField
              label="Start date"
              value={startDate}
              onChange={setStartDate}
              error={errors.startDate}
            />
            <DateField
              label="End date"
              value={endDate}
              onChange={setEndDate}
              error={errors.endDate}
            />
            <Field label="Recommended duration" hint="optional">
              <input
                className={inputCls}
                value={recommendedDuration}
                onChange={(e) => setRecommendedDuration(e.target.value)}
                placeholder="e.g. 15–30s"
              />
            </Field>
          </div>
        )}

        {/* STEP 6 — Content rights */}
        {step === 5 && (
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

        {/* STEP 7 — Review */}
        {step === 6 && (
          <div className="space-y-4 text-sm">
            <p className="font-medium">Review your campaign</p>
            <ReviewRow label="Name" value={title} />
            <ReviewRow label="Category" value={category} />
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
              label="Max payout / clip"
              value={maxPayoutPerClip ? rup(Number(maxPayoutPerClip)) : "—"}
            />
            <ReviewRow
              label="Duration"
              value={`${startDate || "—"} → ${endDate || "—"}${recommendedDuration ? ` (${recommendedDuration})` : ""}`}
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
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => goStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit("open")}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
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
