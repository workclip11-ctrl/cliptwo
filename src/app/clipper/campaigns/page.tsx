"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X, Heart } from "lucide-react";
import { CampaignCard } from "@/components/CampaignCard";
import { useStore } from "@/lib/store";
import type { Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["Instagram", "YouTube", "TikTok"];
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
      (c) => c.status === "open" || c.status === "near_budget",
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Open campaigns from creators looking for clippers. Tap a card to view
          the brief.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
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

        <div className="flex flex-wrap gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground sm:flex-initial"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors sm:flex-initial ${
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
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors sm:flex-initial ${
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

      {showFilters && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
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

      {list.length === 0 ? (
        <p className="text-sm text-muted">
          No campaigns match your filters. Try broadening your search.
        </p>
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
