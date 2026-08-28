"use client";

import Link from "next/link";
import { Check, Ban, Film } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export default function CreatorSubmissionsPage() {
  const { campaigns, clips, setClipStatus } = useStore();
  const { user } = useAuth();

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const pending = received.filter((k) => k.status === "pending");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          Review clips submitted to your campaigns.
        </p>
      </div>

      {/* Review queue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Review queue
        </h2>
        <div className="space-y-3">
          {pending.map((k) => {
            const camp = campaigns.find((c) => c.id === k.campaignId);
            return (
              <div key={k.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/clip/${k.id}`}
                      className="truncate text-sm font-medium hover:underline underline-offset-2"
                    >
                      @{k.clipper}
                    </Link>
                    <p className="truncate text-xs text-muted">{camp?.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{k.caption}</p>
                  </div>
                  <span className="text-muted">
                    {k.platform ? <PlatformIcon p={k.platform} size={15} /> : null}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setClipStatus(k.id, "approved")}
                    className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-xs font-medium text-green"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    onClick={() => setClipStatus(k.id, "rejected")}
                    className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                  >
                    <Ban size={13} /> Reject
                  </button>
                </div>
              </div>
            );
          })}
          {pending.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
              Nothing pending — all clips reviewed.
            </p>
          )}
        </div>
      </section>

      {/* All submissions */}
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
    </div>
  );
}
