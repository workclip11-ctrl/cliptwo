"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { rup, clipEarnings } from "@/lib/format";

export default function ClipperSubmissionsPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();
  const myClips = clips.filter((k) => k.userId === user?.id || !k.userId);

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
                    <Link href={`/clip/${k.id}`} className="font-medium hover:underline underline-offset-2">
                      {campaigns.find((c) => c.id === k.campaignId)?.title ?? "Campaign"}
                    </Link>
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
