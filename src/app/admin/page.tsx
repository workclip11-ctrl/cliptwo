"use client";

import Link from "next/link";
import { Users, Megaphone, Wallet, Clock, CheckCircle2, Banknote } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { useStore } from "@/lib/store";
import { rup, fmtViews, clipEarnings } from "@/lib/format";

export default function AdminDashboard() {
  const { campaigns, clips, profiles } = useStore();

  const clippers = profiles.filter((p) => p.role === "clipper");
  const creators = profiles.filter((p) => p.role === "creator");
  const admins = profiles.filter((p) => p.role === "admin");

  const pending = clips.filter((k) => k.status === "pending");
  const approved = clips.filter((k) => k.status === "approved");
  const rejected = clips.filter((k) => k.status === "rejected");
  const paid = clips.filter((k) => k.status === "paid");

  // Earnings that have actually been released to clippers.
  const paidOut = paid.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  // Approved clips not yet paid — the admin's outstanding payable.
  const payable = approved.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const totalEarned = clips.reduce((s, k) => s + clipEarnings(k, campaigns), 0);

  const openCampaigns = campaigns.filter((c) => c.status === "open");
  const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent = campaigns.reduce((s, c) => s + (c.spent ?? 0), 0);

  const recentClips = [...clips]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, 6);
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clippers" value={String(clippers.length)} icon={<Users size={16} />} />
        <StatCard label="Creators" value={String(creators.length)} icon={<Megaphone size={16} />} />
        <StatCard label="Pending review" value={String(pending.length)} icon={<Clock size={16} />} />
        <StatCard label="Paid out" value={rup(paidOut)} icon={<Wallet size={16} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link
          href="/admin/clips?filter=pending"
          className="rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/30"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Clock size={14} /> Awaiting review
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold">{pending.length}</p>
          <p className="mt-1 text-xs text-muted">clips need an approve / reject decision</p>
        </Link>
        <Link
          href="/admin/clips?filter=approved"
          className="rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/30"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <Banknote size={14} /> Outstanding payable
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold">{rup(payable)}</p>
          <p className="mt-1 text-xs text-muted">approved, not yet paid</p>
        </Link>
        <Link
          href="/admin/clips?filter=paid"
          className="rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/30"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-muted">
            <CheckCircle2 size={14} /> Released to clippers
          </p>
          <p className="mt-2 font-mono text-2xl font-semibold">{rup(paidOut)}</p>
          <p className="mt-1 text-xs text-muted">{paid.length} clips paid</p>
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Clip status
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="font-mono text-lg font-semibold">{pending.length}</p>
              <p className="text-xs text-muted">Pending</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="font-mono text-lg font-semibold">{approved.length}</p>
              <p className="text-xs text-muted">Approved</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="font-mono text-lg font-semibold">{paid.length}</p>
              <p className="text-xs text-muted">Paid</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="font-mono text-lg font-semibold">{rejected.length}</p>
              <p className="text-xs text-muted">Rejected</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Total earned (all time)</span>
              <span className="font-mono font-medium">{rup(totalEarned)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted">Campaigns</span>
              <span className="font-mono font-medium">
                {campaigns.length} ({openCampaigns.length} open)
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted">Budget used</span>
              <span className="font-mono font-medium">
                {rup(totalSpent)} / {rup(totalBudget)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted">Staff (admin)</span>
              <span className="font-mono font-medium">{admins.length}</span>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recent clips
            </h2>
            <Link
              href="/admin/clips"
              className="text-xs font-medium text-accent hover:underline underline-offset-2"
            >
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
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Recent campaigns
          </h2>
          <Link
            href="/admin/campaigns"
            className="text-xs font-medium text-accent hover:underline underline-offset-2"
          >
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
  );
}
