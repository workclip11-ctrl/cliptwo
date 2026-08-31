"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, isEarned, creatorFee, PLATFORM_FEE_RATE } from "@/lib/finance";

export default function CreatorWalletPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const fin = financeOf(received, campaigns);
  const totalSpent = fin.paid;
  const totalFee = creatorFee(totalSpent);

  const topClips = [...received]
    .filter((k) => isEarned(k.status))
    .sort((a, b) => clipEarnings(b, campaigns) - clipEarnings(a, campaigns))
    .slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Your campaign payouts, earned per approved clip.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Total earned</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{rup(fin.earned)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-muted">{rup(totalFee)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Paid out</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{rup(totalSpent)}</p>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-5 sm:col-span-1">
          <p className="text-xs text-muted">Outstanding payable</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{rup(fin.outstanding)}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Earnings by clip
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Clipper</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Fee</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topClips.map((k) => {
                const gross = clipEarnings(k, campaigns);
                const fee = creatorFee(gross);
                return (
                  <tr key={k.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/clip/${k.id}`}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        @{k.clipper}
                      </Link>
                      <p className="text-xs text-muted">
                        {campaigns.find((c) => c.id === k.campaignId)?.title}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {fmtViews(k.views)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {rup(gross)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted">
                      {rup(fee)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-green">
                      {rup(gross - fee)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {topClips.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              No earned clips yet.
            </p>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border bg-accent-soft p-4 text-sm text-muted">
        <Wallet size={16} className="mt-0.5 shrink-0" />
        <p>
          Payouts are settled to your registered UPI after clips are approved and
          views are verified. A {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee applies to all earnings.
        </p>
      </div>
    </div>
  );
}
