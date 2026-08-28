"use client";

import Link from "next/link";
import { Users, Megaphone, Film, Wallet } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup, fmtViews, clipEarnings } from "@/lib/format";

export default function AdminDashboard() {
  const { campaigns, clips, profiles } = useStore();

  const clippers = profiles.filter((p) => p.role === "clipper");
  const creators = profiles.filter((p) => p.role === "creator");
  const pending = clips.filter((k) => k.status === "pending");
  const paid = clips.filter((k) => k.status === "paid").length;
  const totalPaid = clips.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const recentClips = [...clips]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, 5);
  const recentCampaigns = [...campaigns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Overview of users, campaigns and payouts across cliptwo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Clippers" value={String(clippers.length)} icon={<Users size={16} />} />
        <StatCard label="Creators" value={String(creators.length)} icon={<Megaphone size={16} />} />
        <StatCard label="Pending review" value={String(pending.length)} icon={<Film size={16} />} />
        <StatCard label="Paid out" value={rup(totalPaid)} icon={<Wallet size={16} />} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recent clips
            </h2>
            <Link href="/admin/clips" className="text-xs font-medium text-accent hover:underline underline-offset-2">
              Manage
            </Link>
          </div>
          <div className="divide-y rounded-2xl border bg-card">
            {recentClips.map((k) => {
              const c = campaigns.find((x) => x.id === k.campaignId);
              return (
                <div key={k.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">@{k.clipper}</p>
                    <p className="truncate text-xs text-muted">{c?.title ?? "Campaign"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs">{fmtViews(k.views)}</span>
                    <StatusPill status={k.status} />
                  </div>
                </div>
              );
            })}
            {recentClips.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No clips yet.</p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recent campaigns
            </h2>
            <Link href="/admin/campaigns" className="text-xs font-medium text-accent hover:underline underline-offset-2">
              Manage
            </Link>
          </div>
          <div className="divide-y rounded-2xl border bg-card">
            {recentCampaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.title}</p>
                  <p className="truncate text-xs text-muted">{c.creator}</p>
                </div>
                <StatusPill status={c.status} />
              </div>
            ))}
            {recentCampaigns.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No campaigns yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
