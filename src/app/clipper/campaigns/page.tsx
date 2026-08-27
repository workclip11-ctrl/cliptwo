"use client";

import { CampaignCard } from "@/components/CampaignCard";
import { useStore } from "@/lib/store";

export default function ClipperCampaignsPage() {
  const { campaigns } = useStore();
  const open = campaigns.filter((c) => c.status === "open");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          Open campaigns from creators looking for clippers. Tap a card to view the brief.
        </p>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted">No open campaigns right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((c, i) => (
            <CampaignCard key={c.id} campaign={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
