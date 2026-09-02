"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { useStore } from "@/lib/store";

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Website</h1>
        <p className="mt-1 text-sm text-muted">
          Edit the landing page hero copy and choose which campaigns are featured.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Hero
        </h2>
        <label className="mt-4 block text-sm font-medium">Headline</label>
        <input
          value={heroTitle}
          onChange={(e) => {
            dirty.current = true;
            setHeroTitle(e.target.value);
          }}
          placeholder="Turn creator content into clips. Get paid for the views."
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <label className="mt-4 block text-sm font-medium">Subtitle</label>
        <textarea
          value={heroSubtitle}
          onChange={(e) => {
            dirty.current = true;
            setHeroSubtitle(e.target.value);
          }}
          rows={3}
          placeholder="cliptwo connects creators who have long-form content with clippers who cut it into clips…"
          className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Featured campaigns
        </h2>
        <p className="mt-1 text-xs text-muted">
          Selected campaigns appear in the &ldquo;Featured campaigns&rdquo; section
          on the homepage.
        </p>
        <div className="mt-4 space-y-2">
          {openCampaigns.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={featured.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="font-medium">{c.title}</span>
              <span className="ml-auto text-xs text-muted">{c.creator}</span>
            </label>
          ))}
          {openCampaigns.length === 0 && (
            <p className="text-sm text-muted">No open campaigns to feature.</p>
          )}
        </div>
      </section>

      <button
        onClick={save}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <Globe size={15} /> {saved ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}
