"use client";

import Link from "next/link";
import { Film } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export default function CreatorSubmissionsPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const pending = received.filter((k) => k.status === "pending");
  const approved = received.filter((k) => k.status === "approved");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          Clips submitted to your campaigns. Reviews and payouts are handled by
          the admin team.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Total submissions</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{received.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Approved</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{approved.length}</p>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-5 sm:col-span-1">
          <p className="text-xs text-muted">Awaiting review</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{pending.length}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          All submissions
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Clipper</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
                <th className="px-4 py-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {received.map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                return (
                  <tr key={k.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/clip/${k.id}`}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        @{k.clipper}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{camp?.title}</td>
                    <td className="px-4 py-3 text-right font-mono">{k.views}</td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill status={k.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {received.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">
              No submissions yet.
            </p>
          )}
        </div>
      </section>

      {pending.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border bg-accent-soft p-4 text-sm text-muted">
          <Film size={16} className="mt-0.5 shrink-0" />
          <p>
            {pending.length} clip{pending.length === 1 ? "" : "s"} awaiting review
            — our team will approve, reject and release funds on your behalf.
          </p>
        </div>
      )}
    </div>
  );
}
