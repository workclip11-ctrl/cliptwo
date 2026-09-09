"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { PlatformIcon } from "@/components/PlatformIcon";

export default function AdminWebsite() {
  const { siteSettings, campaigns, setSiteSettings } = useStore();
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [featured, setFeatured] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) {
      setHeroTitle(siteSettings.heroTitle);
      setHeroSubtitle(siteSettings.heroSubtitle);
      setFeatured(siteSettings.featuredIds);
    }
  }, [siteSettings]);

  function toggle(id: string) {
    dirty.current = true;
    setFeatured((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  }

  function save() {
    dirty.current = false;
    setSiteSettings({
      heroTitle: heroTitle.trim(),
      heroSubtitle: heroSubtitle.trim(),
      featuredIds: featured,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const openCampaigns = campaigns.filter((c) => c.status === "open");

  return (
    <div className="mx-auto max-w-[1120px] space-y-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Website
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Manage the public ClipTwo homepage content and featured campaigns.
        </p>
      </div>

      {/* ── Section 1: Hero content ─────────────────────── */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight">Hero content</h2>
        <p className="mt-1 text-[13px] text-muted">
          Control the headline and supporting message shown on the public homepage.
        </p>

        <div className="mt-6 space-y-6">
          {/* Headline */}
          <div>
            <label
              htmlFor="hero-headline"
              className="block text-[13px] font-medium text-foreground"
            >
              Headline
            </label>
            <input
              id="hero-headline"
              type="text"
              value={heroTitle}
              onChange={(e) => {
                dirty.current = true;
                setHeroTitle(e.target.value);
              }}
              placeholder="Turn creator content into clips. Get paid for the views."
              className="mt-1.5 h-11 w-full rounded-[10px] border border-border/60 bg-card px-4 text-[15px] outline-none transition-colors focus:border-foreground/30"
            />
            <p className="mt-1 text-right text-[12px] text-muted">
              {heroTitle.length} characters
            </p>
          </div>

          {/* Subtitle */}
          <div>
            <label
              htmlFor="hero-subtitle"
              className="block text-[13px] font-medium text-foreground"
            >
              Subtitle
            </label>
            <textarea
              id="hero-subtitle"
              value={heroSubtitle}
              onChange={(e) => {
                dirty.current = true;
                setHeroSubtitle(e.target.value);
              }}
              rows={4}
              placeholder="cliptwo connects creators who have long-form content with clippers who cut it into clips…"
              className="mt-1.5 w-full resize-none rounded-[10px] border border-border/60 bg-card px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors focus:border-foreground/30"
            />
            <p className="mt-1 text-right text-[12px] text-muted">
              {heroSubtitle.length} characters
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 2: Featured campaigns ───────────────── */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight">Featured campaigns</h2>
        <p className="mt-1 text-[13px] text-muted">
          Choose which live campaigns appear in the Featured campaigns section on the public homepage.
        </p>

        <div className="mt-6">
          {openCampaigns.length === 0 ? (
            <div className="rounded-[10px] border border-border/40 bg-card px-5 py-8 text-center">
              <p className="text-[15px] font-medium">No open campaigns to feature.</p>
              <p className="mt-1 text-[13px] text-muted">
                Campaigns will appear here when their status is Open.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {openCampaigns.map((c) => {
                const isSelected = featured.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    className={`flex w-full cursor-pointer items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left transition-colors duration-150 ${
                      isSelected
                        ? "border-foreground/20 bg-accent-soft"
                        : "border-border/40 bg-card hover:border-foreground/10 hover:bg-accent-soft/30"
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                        isSelected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-background"
                      }`}
                    >
                      {isSelected && <Check size={14} strokeWidth={2.5} />}
                    </div>

                    {/* Thumbnail (if available) */}
                    {c.thumbnails && c.thumbnails.length > 0 && (
                      <img
                        src={c.thumbnails[0]}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-[6px] object-cover"
                      />
                    )}

                    {/* Campaign info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{c.title}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
                        <span>{c.creator}</span>
                        {c.platforms && c.platforms.length > 0 && (
                          <>
                            <span className="text-border">·</span>
                            <span className="flex items-center gap-1">
                              {c.platforms.map((p) => (
                                <PlatformIcon key={p} p={p} size={12} />
                              ))}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Selected indicator */}
                    {isSelected && (
                      <span className="shrink-0 text-[12px] font-medium text-muted">
                        Featured
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Save area ────────────────────────── */}
      <section className="border-t border-border/40 pt-8">
        <button
          onClick={save}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[8px] bg-foreground px-6 text-[15px] font-medium text-background transition-opacity hover:opacity-90"
        >
          {saved ? (
            <>
              <Check size={16} /> Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </section>
    </div>
  );
}
