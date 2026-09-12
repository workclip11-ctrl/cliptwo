"use client";

import { useState, useMemo } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  ChevronDown,
  Heart,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { CampaignCard } from "@/components/CampaignCard";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { campaignBudget } from "@/lib/finance";
import type { Platform, CampaignStatus } from "@/lib/types";

type SortKey = "cpm" | "newest" | "ending" | "budget";

interface Filters {
  search: string;
  platform: Platform | "";
  category: string;
  cpmMin: string;
  cpmMax: string;
  minViews: string;
  budgetRemaining: string;
  status: CampaignStatus | "";
  savedOnly: boolean;
}

const CATEGORIES = [
  "Fashion",
  "Fitness",
  "Food",
  "Tech",
  "Gaming",
  "Lifestyle",
  "Education",
  "Entertainment",
  "Travel",
  "Beauty",
  "Finance",
  "Other",
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "cpm", label: "Highest CPM" },
  { key: "newest", label: "Newest" },
  { key: "ending", label: "Ending soon" },
  { key: "budget", label: "Most budget remaining" },
];

const STATUS_OPTIONS: { value: CampaignStatus | ""; label: string }[] = [
  { value: "", label: "All active" },
  { value: "open", label: "Open" },
  { value: "near_budget", label: "Near budget" },
];

export default function CampaignsPage() {
  const { campaigns, savedCampaigns, financeRecords } = useStore();
  const { user } = useAuth();
  const [sort, setSort] = useState<SortKey>("cpm");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    platform: "",
    category: "",
    cpmMin: "",
    cpmMax: "",
    minViews: "",
    budgetRemaining: "",
    status: "",
    savedOnly: false,
  });

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () =>
    setFilters({
      search: "",
      platform: "",
      category: "",
      cpmMin: "",
      cpmMax: "",
      minViews: "",
      budgetRemaining: "",
      status: "",
      savedOnly: false,
    });

  const activeFilterCount =
    (filters.platform ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.cpmMin ? 1 : 0) +
    (filters.cpmMax ? 1 : 0) +
    (filters.minViews ? 1 : 0) +
    (filters.budgetRemaining ? 1 : 0) +
    (filters.status ? 1 : 0) +
    (filters.savedOnly ? 1 : 0);

  const visible = useMemo(() => {
    const list = campaigns.filter((c) => {
      if (c.status === "closed" || c.status === "draft" || c.status === "budget_reached" || c.status === "archived") return false;
      if (filters.status && c.status !== filters.status) return false;
      if (filters.platform && c.platform !== filters.platform) return false;
      if (filters.category && (c.category || c.niche) !== filters.category) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${c.title} ${c.creator} ${c.category || c.niche} ${c.brief}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const cpm = c.payout ?? 0;
      if (filters.cpmMin && cpm < Number(filters.cpmMin)) return false;
      if (filters.cpmMax && cpm > Number(filters.cpmMax)) return false;
      if (filters.minViews && (c.viewRules?.minViews ?? 0) < Number(filters.minViews)) return false;
      if (filters.budgetRemaining) {
        const b = campaignBudget(c, financeRecords);
        if (b.remaining < Number(filters.budgetRemaining)) return false;
      }
      if (filters.savedOnly && user && !savedCampaigns.includes(c.id)) return false;
      return true;
    });

    list.sort((a, b) => {
      switch (sort) {
        case "cpm":
          return (b.payout ?? 0) - (a.payout ?? 0);
        case "newest":
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
        case "ending":
          return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
        case "budget": {
          const rb = campaignBudget(b, financeRecords).remaining;
          const ra = campaignBudget(a, financeRecords).remaining;
          return rb - ra;
        }
      }
    });

    return list;
  }, [campaigns, financeRecords, sort, filters, savedCampaigns, user]);

  return (
    <main className="min-h-screen bg-background">
      <TopBar />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Marketplace</p>
        <h1 className="mt-3 text-[28px] font-bold tracking-tight leading-tight">Find a campaign</h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
          Browse open campaigns from creators looking for clippers. See the brief, the rate, and the requirements — then start cutting.
        </p>

        {/* Search + sort bar */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              placeholder="Search campaigns…"
              className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-[14px] outline-none focus:border-foreground"
            />
            {filters.search && (
              <button
                onClick={() => updateFilter("search", "")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters((s) => !s)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-colors cursor-pointer ${
                showFilters || activeFilterCount > 0
                  ? "border-foreground/20 bg-accent-soft text-foreground"
                  : "text-muted hover:bg-accent-soft"
              }`}
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none rounded-lg border bg-background px-3 py-2.5 pr-8 text-[13px] outline-none focus:border-foreground cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
            </div>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 rounded-xl border bg-card p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Platform */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">Platform</label>
                <select
                  value={filters.platform}
                  onChange={(e) => updateFilter("platform", e.target.value as Platform | "")}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground cursor-pointer"
                >
                  <option value="">All platforms</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Kick">Kick</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => updateFilter("category", e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground cursor-pointer"
                >
                  <option value="">All categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* CPM range */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">CPM range (₹)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filters.cpmMin}
                    onChange={(e) => updateFilter("cpmMin", e.target.value)}
                    placeholder="Min"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                  />
                  <input
                    type="number"
                    value={filters.cpmMax}
                    onChange={(e) => updateFilter("cpmMax", e.target.value)}
                    placeholder="Max"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                  />
                </div>
              </div>

              {/* Min views */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">Minimum views</label>
                <input
                  type="number"
                  value={filters.minViews}
                  onChange={(e) => updateFilter("minViews", e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              {/* Budget remaining */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">Budget remaining (₹)</label>
                <input
                  type="number"
                  value={filters.budgetRemaining}
                  onChange={(e) => updateFilter("budgetRemaining", e.target.value)}
                  placeholder="Min remaining"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
                />
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => updateFilter("status", e.target.value as CampaignStatus | "")}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground cursor-pointer"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Saved only */}
              <div className="flex items-end">
                <button
                  onClick={() => updateFilter("savedOnly", !filters.savedOnly)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                    filters.savedOnly
                      ? "border-red/30 bg-red/10 text-red"
                      : "text-muted hover:bg-accent-soft"
                  }`}
                >
                  <Heart size={14} className={filters.savedOnly ? "fill-red" : ""} />
                  Saved only
                </button>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-4 flex items-center gap-3 border-t border-border/40 pt-4">
                <button
                  onClick={clearFilters}
                  className="text-[13px] font-medium text-foreground hover:underline underline-offset-2 cursor-pointer"
                >
                  Clear all
                </button>
                <span className="text-[13px] text-muted">
                  {visible.length} campaign{visible.length !== 1 ? "s" : ""} found
                </span>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {visible.length === 0 ? (
          <div className="mt-16 rounded-xl border border-dashed border-border/60 bg-card px-6 py-16 text-center">
            <p className="text-[15px] font-medium text-foreground">
              {activeFilterCount > 0
                ? "No campaigns match your filters"
                : "No open campaigns right now"}
            </p>
            <p className="mt-2 text-[14px] text-muted">
              {activeFilterCount > 0
                ? "Try adjusting your filters or clearing them to see all campaigns."
                : "Check back soon — creators are always launching new campaigns."}
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-5 text-[13px] font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((c, i) => (
              <CampaignCard key={c.id} campaign={c} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
