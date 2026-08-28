"use client";

import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, clipEarnings } from "@/lib/format";
import { financeOf } from "@/lib/finance";

const UPI_ID = "maya.cuts@upi";

export default function ClipperWalletPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();
  const myClips = clips.filter((k) => k.userId === user?.id || !k.userId);
  const fin = financeOf(myClips, campaigns);

  const available = fin.paid;
  const pending = fin.outstanding;
  const total = fin.earned;

  const byCampaign = new Map<string, number>();
  for (const k of myClips) {
    byCampaign.set(
      k.campaignId,
      (byCampaign.get(k.campaignId) ?? 0) + clipEarnings(k, campaigns),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">Your earnings and payout details.</p>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <p className="text-sm text-muted">Total earnings</p>
        <p className="mt-1 font-mono text-3xl font-semibold">{rup(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted">Available (paid)</p>
            <p className="mt-1 font-mono text-lg font-semibold text-green">{rup(available)}</p>
          </div>
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted">Pending payout</p>
            <p className="mt-1 font-mono text-lg font-semibold text-amber">{rup(pending)}</p>
          </div>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Earnings from campaigns
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border bg-card">
          {byCampaign.size === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No earnings yet.</p>
          ) : (
            <ul className="divide-y">
              {[...byCampaign.entries()].map(([id, amount]) => (
                <li key={id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="font-medium">
                    {campaigns.find((c) => c.id === id)?.title ?? id}
                  </span>
                  <span className="font-mono">{rup(amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          UPI details
        </h2>
        <div className="mt-3 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">Payout UPI ID</p>
              <p className="mt-1 font-mono text-sm font-medium">{UPI_ID}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-accent-soft px-3 py-1.5 text-xs font-medium text-green">
              Verified
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            Update your UPI ID from Settings → UPI details.
          </p>
        </div>
      </section>
    </div>
  );
}
