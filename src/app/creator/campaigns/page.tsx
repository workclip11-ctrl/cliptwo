"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { PlatformIcon } from "@/components/PlatformIcon";
import { NewCampaignModal } from "@/components/NewCampaignModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup } from "@/lib/format";
import { campaignSpent } from "@/lib/finance";
import type { Campaign, Platform } from "@/lib/types";

type StatusFilter = "all" | "active" | "draft" | "closed";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
  { key: "closed", label: "Closed" },
];

function statusLabel(c: Campaign): string {
  if (c.status === "open" && c.launchPaymentStatus === "verified")
    return "Published";
  if (c.status === "draft" && c.launchPaymentStatus === "submitted")
    return "Payment pending";
  if (c.status === "draft" && c.launchPaymentStatus === "rejected")
    return "Payment rejected";
  if (c.status === "draft") return "Payment required";
  if (c.status === "paused") return "Paused";
  if (c.status === "open") return "Open";
  return "Closed";
}

function statusColor(c: Campaign): string {
  if (c.status === "open" && c.launchPaymentStatus === "verified")
    return "bg-green/10 text-green border-green/20";
  if (c.status === "draft" && c.launchPaymentStatus === "submitted")
    return "bg-amber/10 text-amber border-amber/20";
  if (c.status === "draft" && c.launchPaymentStatus === "rejected")
    return "bg-red/10 text-red border-red/20";
  if (c.status === "draft") return "bg-amber/10 text-amber border-amber/20";
  if (c.status === "paused") return "bg-muted/10 text-muted border-muted/20";
  if (c.status === "open") return "bg-green/10 text-green border-green/20";
  return "bg-muted/10 text-muted border-muted/20";
}

export default function CreatorCampaignsPage() {
  const {
    campaigns,
    clips,
    addCampaign,
    closeCampaign,
    financeRecords,
  } = useStore();
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );

  const filtered = useMemo(() => {
    let list = myCampaigns;

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          (c.niche ?? "").toLowerCase().includes(q) ||
          c.platform.toLowerCase().includes(q),
      );
    }

    if (statusFilter === "active") {
      list = list.filter(
        (c) =>
          c.status === "open" ||
          c.status === "paused" ||
          (c.status === "draft" && c.launchPaymentStatus !== "rejected"),
      );
    } else if (statusFilter === "draft") {
      list = list.filter((c) => c.status === "draft");
    } else if (statusFilter === "closed") {
      list = list.filter(
        (c) => c.status === "closed" || c.status === "archived",
      );
    }

    return list;
  }, [myCampaigns, query, statusFilter]);

  const activeCampaigns = myCampaigns.filter((c) => c.status === "open");
  const draftCampaigns = myCampaigns.filter((c) => c.status === "draft");

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
            Campaigns
          </h1>
          <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
            Manage your active, pending, and past campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border bg-card px-4 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground sm:h-11 sm:px-5 sm:text-[14px]"
          >
            Quick add
          </button>
          <Link
            href="/creator/campaigns/new"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent px-4 text-[13px] font-medium text-white transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98] sm:h-11 sm:px-5 sm:text-[14px]"
          >
            <Plus size={16} /> Create campaign
          </Link>
        </div>
      </section>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-[400px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns..."
            aria-label="Search campaigns"
            className="h-11 w-full rounded-[10px] border bg-background pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-muted/50 focus:border-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`inline-flex h-10 cursor-pointer items-center rounded-[10px] border px-3 text-[12px] font-medium transition-all duration-150 sm:h-11 sm:px-4 sm:text-[13px] ${
                statusFilter === f.key
                  ? "border-foreground bg-accent-soft text-foreground"
                  : "border-transparent text-muted hover:bg-accent-soft/60"
              }`}
            >
              {f.label}
              {f.key === "all" && (
                <span className="ml-1.5 text-[11px] text-muted/60">
                  {myCampaigns.length}
                </span>
              )}
              {f.key === "active" && (
                <span className="ml-1.5 text-[11px] text-muted/60">
                  {activeCampaigns.length}
                </span>
              )}
              {f.key === "draft" && (
                <span className="ml-1.5 text-[11px] text-muted/60">
                  {draftCampaigns.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Campaign List ───────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
          <p className="text-[15px] font-medium text-foreground">
            {query || statusFilter !== "all"
              ? "No campaigns match your filters"
              : "No campaigns yet"}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {query || statusFilter !== "all"
              ? "Try adjusting your search or filter criteria."
              : "Create your first campaign to start receiving clips."}
          </p>
          {!query && statusFilter === "all" && (
            <Link
              href="/creator/campaigns/new"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] bg-accent px-5 text-[14px] font-medium text-white transition-all duration-150 hover:bg-foreground/90"
            >
              <Plus size={16} /> Create campaign
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <CampaignRow
              key={c.id}
              c={c}
              clips={clips}
              financeRecords={financeRecords}
              onOpen={() => router.push(`/creator/campaigns/${c.id}`)}
              onClose={() => closeCampaign(c.id)}
            />
          ))}
        </div>
      )}

      {/* ── Quick Add Modal ─────────────────────────────── */}
      {open && (
        <NewCampaignModal
          onClose={() => setOpen(false)}
          onSubmit={(
            title,
            brief,
            platform,
            payout,
            niche,
            budget,
            sourceLink,
            extra,
          ) => {
            addCampaign({
              title,
              creator: user?.name ?? user?.email ?? "Creator",
              created_by: user?.id,
              brief,
              platform: platform as Platform,
              payout,
              niche,
              budget,
              sourceLink: sourceLink || undefined,
              spent: 0,
              daysLeft: 30,
              category: niche,
              platforms: extra.platforms,
              objective: extra.objective || undefined,
              maxPayoutPerClip: extra.maxPayoutPerClip || undefined,
              recommendedDuration: extra.recommendedDuration || undefined,
              aspectRatio: extra.aspectRatio || undefined,
              cta: extra.cta || undefined,
              hook: extra.hook || undefined,
              branding: extra.branding || undefined,
              startDate: new Date().toISOString().slice(0, 10),
              endDate: new Date(Date.now() + 30 * 864e5)
                .toISOString()
                .slice(0, 10),
            });
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Campaign Row — media-first, information hierarchy
   ──────────────────────────────────────────────────────────────────────────── */

function CampaignRow({
  c,
  clips,
  financeRecords,
  onOpen,
  onClose,
}: {
  c: Campaign;
  clips: import("@/lib/types").Clip[];
  financeRecords: import("@/lib/types").FinanceRecord[];
  onOpen: () => void;
  onClose: () => void;
}) {
  const campClips = clips.filter((k) => k.campaignId === c.id);
  const approvedN = campClips.filter((k) => k.status === "approved").length;
  const pendingN = campClips.filter((k) => k.status === "pending").length;
  const spent = campaignSpent(c, financeRecords);
  const pct = c.budget
    ? Math.min(100, Math.round((spent / c.budget) * 100))
    : 0;
  const remaining = (c.budget ?? 0) - spent;
  const thumb = c.thumbnails?.[0];

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer rounded-[12px] border bg-card transition-all duration-150 hover:border-foreground/10 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
    >
      <div className="flex gap-4 p-5 sm:gap-5 sm:p-6">
        {/* ── Thumbnail ──────────────────────────── */}
        <div className="h-[72px] w-[120px] shrink-0 overflow-hidden rounded-lg bg-accent-soft sm:h-[80px] sm:w-[140px]">
          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <PlatformIcon p={c.platform} size={20} />
            </div>
          )}
        </div>

        {/* ── Main Content ───────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Top row: Title + Status + Payout */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h3 className="truncate text-[16px] font-semibold leading-snug group-hover:underline underline-offset-2 sm:text-[17px]">
                  {c.title}
                </h3>
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor(c)}`}
                >
                  {statusLabel(c)}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted">
                <PlatformIcon p={c.platform} size={12} />
                {c.niche ?? c.category} · {c.platform}
              </p>
            </div>

            {/* Payout */}
            <div className="text-right">
              <p className="font-mono text-[18px] font-bold tracking-tight text-amber">
                {rup(c.payout)}
              </p>
              <p className="text-[12px] text-muted">per 1K views</p>
            </div>
          </div>

          {/* Brief preview */}
          {c.brief && (
            <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
              {c.brief}
            </p>
          )}

          {/* Budget bar */}
          {c.budget ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[12px] text-muted">
                <span>
                  {rup(spent)} spent
                </span>
                <span>
                  {rup(remaining)} remaining
                </span>
              </div>
              <div className="mt-1.5 h-[4px] w-full overflow-hidden rounded-full bg-accent-soft">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-3" />
          )}

          {/* Bottom row: Metrics + Close */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="flex items-center gap-4 text-[13px] text-muted">
              <span>{campClips.length} clips</span>
              <span className="text-green">{approvedN} approved</span>
              {pendingN > 0 && (
                <span className="text-amber">{pendingN} pending</span>
              )}
              <span>{c.daysLeft}d left</span>
            </div>

            {c.status === "open" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="inline-flex h-9 items-center rounded-[10px] border border-border px-4 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-red/30 hover:bg-red/5 hover:text-red"
              >
                Close campaign
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
