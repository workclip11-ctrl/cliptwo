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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Find campaigns worth clipping.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-foreground"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
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
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              showSaved
                ? "border-foreground bg-accent-soft text-foreground"
                : "text-muted hover:bg-accent-soft/60"
            }`}
          >
            <Heart size={15} className={showSaved ? "fill-red text-red" : ""} />
            Saved
            {savedCampaigns.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[10px] text-white">
                {savedCampaigns.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Filters</p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-accent hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform | "")}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="">All platforms</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Min CPM (₹)
              </label>
              <input
                type="number"
                value={minCpm}
                onChange={(e) => setMinCpm(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Max CPM (₹)
              </label>
              <input
                type="number"
                value={maxCpm}
                onChange={(e) => setMaxCpm(e.target.value)}
                placeholder="∞"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Min budget remaining (₹)
              </label>
              <input
                type="number"
                value={minBudget}
                onChange={(e) => setMinBudget(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Min views required
              </label>
              <input
                type="number"
                value={minViews}
                onChange={(e) => setMinViews(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Max days remaining
              </label>
              <input
                type="number"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="∞"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {(activeFilterCount > 0 || showSaved || q) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            {list.length} campaign{list.length === 1 ? "" : "s"}
          </span>
          {q && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs">
              &quot;{q}&quot;
              <button onClick={() => setQ("")}>
                <X size={12} />
              </button>
            </span>
          )}
          {platform && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs">
              {platform}
              <button onClick={() => setPlatform("")}>
                <X size={12} />
              </button>
            </span>
          )}
          {category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs">
              {category}
              <button onClick={() => setCategory("")}>
                <X size={12} />
              </button>
            </span>
          )}
          {showSaved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs">
              Saved only
              <button onClick={() => setShowSaved(false)}>
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Opportunity summary */}
      {allActive.length > 0 && !showSaved && !q && activeFilterCount === 0 && (
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>
            <span className="font-medium text-foreground">{allActive.length}</span> campaigns
          </span>
          {highestCpm > 0 && (
            <>
              <span className="text-border">·</span>
              <span>
                Highest CPM <span className="font-medium text-foreground">{rup(highestCpm)}</span>
              </span>
            </>
          )}
          {endingSoon > 0 && (
            <>
              <span className="text-border">·</span>
              <span>
                <span className="font-medium text-amber">{endingSoon}</span> ending soon
              </span>
            </>
          )}
        </div>
      )}

      {/* Grid or empty */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-12 text-center">
          <p className="text-sm font-medium">
            {showSaved ? "No saved campaigns" : "No campaigns found"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {showSaved
              ? "Save campaigns to find them here later."
              : activeFilterCount > 0
                ? "Try removing a filter or broadening your search."
                : "Check back soon for new campaigns."}
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent-soft"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c, i) => (
            <CampaignCard key={c.id} campaign={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
