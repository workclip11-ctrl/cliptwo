"use client";

import { TopBar } from "@/components/TopBar";
import { CampaignCard } from "@/components/CampaignCard";
import { useStore } from "@/lib/store";

export default function CampaignsPage() {
  const { campaigns } = useStore();
  const open = campaigns.filter((c) => c.status === "open");

  return (
    <main className="min-h-screen bg-background">
      <TopBar active="campaigns" />
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Browse</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">All campaigns</h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
          Open campaigns from creators looking for clippers. Tap a card to see the brief, budget and how to join.
        </p>

        {open.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No open campaigns right now.</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((c, i) => (
              <CampaignCard key={c.id} campaign={c} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
