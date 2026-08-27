"use client";

import { useStore } from "@/lib/store";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import type { Campaign, Clip } from "@/lib/types";

const CLIPPER_NAME = "maya.cuts";

function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  if (clip.status !== "approved") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  return camp ? (clip.views / 1000) * camp.payout : 0;
}

export default function ClipperSubmissionsPage() {
  const { campaigns, clips } = useStore();
  const myClips = clips.filter((k) => k.clipper === CLIPPER_NAME);
  const campaignTitle = (id: string) =>
    campaigns.find((c) => c.id === id)?.title ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          {myClips.length} clip{myClips.length === 1 ? "" : "s"} you&apos;ve submitted.
        </p>
      </div>

      {myClips.length === 0 ? (
        <p className="text-sm text-muted">You haven&apos;t submitted any clips yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Clip</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Views</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {myClips.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{campaignTitle(k.campaignId)}</p>
                    <p className="line-clamp-1 max-w-xs text-xs text-muted">{k.caption}</p>
                  </td>
                  <td className="px-4 py-3">
                    <PlatformIcon p={k.platform ?? "Instagram"} size={18} />
                  </td>
                  <td className="px-4 py-3 font-mono">{k.views.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={k.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {rup(clipEarnings(k, campaigns))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
