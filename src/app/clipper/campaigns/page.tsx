"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Heart } from "lucide-react";
import { CampaignCard } from "@/components/CampaignCard";
import { useStore } from "@/lib/store";
import { rup } from "@/lib/format";
import type { Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["Instagram", "YouTube", "Kick"];
const SORT_OPTIONS = [
  { value: "cpm", label: "Highest CPM" },
  { value: "newest", label: "Newest" },
  { value: "ending", label: "Ending soon" },
  { value: "budget", label: "Most budget remaining" },
] as const;

export default function ClipperCampaignsPage() {
  const { campaigns, savedCampaigns } = useStore();
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [category, setCategory] = useState("");
  const [minCpm, setMinCpm] = useState("");
  const [maxCpm, setMaxCpm] = useState("");
  const [minBudget, setMinBudget] = useState("");
  const [minViews, setMinViews] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [sort, setSort] = useState<string>("cpm");
  const [showSaved, setShowSaved] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      if (c.category) set.add(c.category);
      if (c.niche) set.add(c.niche);
    });
    return Array.from(set).sort();
  }, [campaigns]);

  const list = useMemo(() => {
    const active = campaigns.filter(
      (c) =>
        (c.status === "open" || c.status === "near_budget") &&
        c.launchPaymentStatus === "verified",
    );

    const filtered = active.filter((c) => {
      if (showSaved && !savedCampaigns.includes(c.id)) return false;
      if (
        q &&
        !c.title.toLowerCase().includes(q.toLowerCase()) &&
        !c.creator.toLowerCase().includes(q.toLowerCase()) &&
        !(c.category ?? "").toLowerCase().includes(q.toLowerCase()) &&
        !(c.niche ?? "").toLowerCase().includes(q.toLowerCase())
      )
        return false;
      if (platform && c.platform !== platform) return false;
      if (
        category &&
        (c.category ?? c.niche ?? "").toLowerCase() !== category.toLowerCase()
      )
        return false;
      if (minCpm && c.payout < Number(minCpm)) return false;
      if (maxCpm && c.payout > Number(maxCpm)) return false;
      if (minBudget) {
        const remaining = (c.budget ?? 0) - (c.spent ?? 0);
        if (remaining < Number(minBudget)) return false;
      }
      if (minViews && (c.viewRules?.minViews ?? 0) < Number(minViews))
        return false;
      if (maxDays && (c.daysLeft ?? 999) > Number(maxDays)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === "cpm") sorted.sort((a, b) => b.payout - a.payout);
    else if (sort === "newest") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === "ending")
      sorted.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
    else if (sort === "budget")
      sorted.sort(
        (a, b) =>
          (b.budget ?? 0) -
          (b.spent ?? 0) -
          ((a.budget ?? 0) - (a.spent ?? 0)),
      );

    return sorted;
  }, [
    campaigns,
    q,
    platform,
    category,
    minCpm,
    maxCpm,
    minBudget,
    minViews,
    maxDays,
    sort,
    showSaved,
    savedCampaigns,
  ]);

  const activeFilterCount = [
    platform,
    category,
    minCpm,
    maxCpm,
    minBudget,
    minViews,
    maxDays,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setPlatform("");
    setCategory("");
    setMinCpm("");
    setMaxCpm("");
    setMinBudget("");
    setMinViews("");
    setMaxDays("");
  };

  // Opportunity summary — only real data
  const allActive = useMemo(
    () =>
      campaigns.filter(
        (c) =>
          (c.status === "open" || c.status === "near_budget") &&
          c.launchPaymentStatus === "verified",
      ),
    [campaigns],
  );
  const highestCpm = allActive.length
    ? Math.max(...allActive.map((c) => c.payout))
    : 0;
  const endingSoon = allActive.filter((c) => (c.daysLeft ?? 99) <= 7).length;

  return (
    <div className="mx-auto max-w-[1120px] space-y-7 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="mb-2">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
          Campaigns
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Find campaigns worth clipping.
        </p>
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-[400px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaigns..."
            className="h-11 w-full rounded-[10px] border bg-background pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-muted/50 focus:border-foreground"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-11 rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex h-11 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? "border-foreground bg-accent-soft text-foreground"
                : "text-muted hover:bg-accent-soft/60"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSaved(!showSaved)}
            className={`inline-flex h-11 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-medium transition-colors ${
              showSaved
                ? "border-foreground bg-accent-soft text-foreground"
                : "text-muted hover:bg-accent-soft/60"
            }`}
          >
            <Heart
              size={15}
              className={showSaved ? "fill-red text-red" : ""}
            />
            Saved
            {savedCampaigns.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">
                {savedCampaigns.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Filter Panel ────────────────────────────────── */}
      {showFilters && (
        <div className="rounded-[12px] border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[14px] font-medium">Filters</p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-[13px] font-medium text-accent hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Platform">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | "")}
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              >
                <option value="">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Min CPM (₹)">
              <input
                type="number"
                value={minCpm}
                onChange={(e) => setMinCpm(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              />
            </FilterField>
            <FilterField label="Max CPM (₹)">
              <input
                type="number"
                value={maxCpm}
                onChange={(e) => setMaxCpm(e.target.value)}
                placeholder="∞"
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              />
            </FilterField>
            <FilterField label="Min budget remaining (₹)">
              <input
                type="number"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              />
            </FilterField>
            <FilterField label="Min views required">
              <input
                type="number"
                value={minViews}
                onChange={(e) => setMinViews(e.target.value)}
                placeholder="0"
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              />
            </FilterField>
            <FilterField label="Max days remaining">
              <input
                type="number"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="∞"
                className="h-11 w-full rounded-[10px] border bg-background px-3.5 text-[14px] outline-none transition-colors focus:border-foreground"
              />
            </FilterField>
          </div>
        </div>
      )}

      {/* ── Active Filter Chips ─────────────────────────── */}
      {(activeFilterCount > 0 || showSaved || q) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-muted">
            {list.length} campaign{list.length === 1 ? "" : "s"}
          </span>
          {q && (
            <Chip onRemove={() => setQ("")}>&quot;{q}&quot;</Chip>
          )}
          {platform && (
            <Chip onRemove={() => setPlatform("")}>{platform}</Chip>
          )}
          {category && (
            <Chip onRemove={() => setCategory("")}>{category}</Chip>
          )}
          {showSaved && (
            <Chip onRemove={() => setShowSaved(false)}>Saved only</Chip>
          )}
        </div>
      )}

      {/* ── Opportunity Summary ─────────────────────────── */}
      {allActive.length > 0 && !showSaved && !q && activeFilterCount === 0 && (
        <div className="flex items-center gap-4 text-[13px] text-muted">
          <span>
            <span className="font-medium text-foreground">
              {allActive.length}
            </span>{" "}
            campaigns
          </span>
          {highestCpm > 0 && (
            <>
              <span className="text-border">·</span>
              <span>
                Highest CPM{" "}
                <span className="font-semibold text-foreground">
                  {rup(highestCpm)}
                </span>
              </span>
            </>
          )}
          {endingSoon > 0 && (
            <>
              <span className="text-border">·</span>
              <span>
                <span className="font-medium text-amber">{endingSoon}</span>{" "}
                ending soon
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Campaign Grid ───────────────────────────────── */}
      {list.length === 0 ? (
        <div className="rounded-[12px] border border-dashed bg-card py-16 text-center">
          <p className="text-[16px] font-medium">
            {showSaved ? "No saved campaigns" : "No campaigns found"}
          </p>
          <p className="mt-2 text-[14px] text-muted">
            {showSaved
              ? "Save campaigns to find them here later."
              : activeFilterCount > 0
                ? "Try removing a filter or broadening your search."
                : "Check back soon for new campaigns."}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-[10px] border bg-card px-5 text-[14px] font-medium transition-colors hover:bg-accent-soft"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c, i) => (
            <CampaignCard key={c.id} campaign={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] text-muted">{label}</label>
      {children}
    </div>
  );
}

function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[13px] text-muted">
      {children}
      <button
        onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-border/50"
        aria-label="Remove filter"
      >
        <X size={11} />
      </button>
    </span>
  );
}
