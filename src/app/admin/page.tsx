"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Loader2,
  ArrowRight,
  FileText,
  Users,
  AlertTriangle,
  HeadphonesIcon,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export default function AdminDashboard() {
  const { campaigns, clips, profiles, financeRecords, refreshClips } = useStore();
  const { user: _user } = useAuth();
  useAutoRefresh();

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    processed: number;
    synced: number;
    skipped: number;
    errors: number;
    duration: number;
  } | null>(null);

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }
      const res = await fetch("/api/metrics/sync/admin-trigger", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setSyncResult({
        processed: data.processed,
        synced: data.synced,
        skipped: data.skipped,
        errors: data.errors,
        duration: data.duration,
      });
      void refreshClips();
    } catch {
      setSyncResult(null);
    } finally {
      setSyncing(false);
    }
  }

  const clippers = profiles.filter((p) => p.role === "clipper");
  const creators = profiles.filter((p) => p.role === "creator");

  const fin = financeOf(financeRecords);
  const pendingCount = fin.pendingCount;
  const approvedCount = fin.totalCount;
  const paidCount = fin.paidCount;
  const rejectedCount = clips.filter((k) => k.status === "rejected").length;

  const paidOut = fin.paid / 100;
  const payable = (fin.total - fin.paid) / 100;
  const totalEarned = fin.total / 100;

  const openCampaigns = campaigns.filter((c) => c.status === "open");
  const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const totalSpent =
    campaigns.reduce((s, c) => s + campaignSpent(c, financeRecords), 0) / 100;

  const recentClips = [...clips]
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, 4);
  const recentCampaigns = [...campaigns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Welcome ─────────────────────────────────────── */}
      <section>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
          Welcome back, Admin! &#x1F44B;
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">
          Here&apos;s what&apos;s happening on ClipTwo today.
        </p>
      </section>

      {/* ── Overview ────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[17px] font-bold tracking-tight">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total Users"
            value={String(profiles.length)}
            sub={`${clippers.length} clippers &middot; ${creators.length} creators`}
          />
          <MetricCard
            label="Total Creators"
            value={String(creators.length)}
          />
          <MetricCard
            label="Total Clips"
            value={String(approvedCount)}
            sub={`${pendingCount} pending`}
          />
          <MetricCard
            label="Total Revenue"
            value={rup(totalEarned)}
            sub="all time"
          />
        </div>
      </section>

      {/* ── Action queues ───────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[17px] font-bold tracking-tight">
          Action queues
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/admin/clips?filter=pending"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-muted">
                Awaiting review
              </p>
              <ArrowRight
                size={14}
                className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </div>
            <p className="mt-3 font-mono text-[24px] font-bold tracking-tight">
              {pendingCount}
            </p>
            <p className="mt-1 text-[12px] text-muted">Clips</p>
          </Link>

          <Link
            href="/admin/clips?filter=payable"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-muted">
                Outstanding payable
              </p>
              <ArrowRight
                size={14}
                className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </div>
            <p className="mt-3 font-mono text-[24px] font-bold tracking-tight text-amber">
              {rup(payable)}
            </p>
            <p className="mt-1 text-[12px] text-muted">To clippers</p>
          </Link>

          <Link
            href="/admin/clips?filter=paid"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-medium text-muted">
                Released to clippers
              </p>
              <ArrowRight
                size={14}
                className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </div>
            <p className="mt-3 font-mono text-[24px] font-bold tracking-tight text-green">
              {rup(paidOut)}
            </p>
            <p className="mt-1 text-[12px] text-muted">This month</p>
          </Link>
        </div>
      </section>

      {/* ── Metrics sync + Clip status ──────────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Metrics sync */}
        <section>
          <h2 className="mb-4 text-[17px] font-bold tracking-tight">
            Metrics sync
          </h2>
          <div className="rounded-[14px] border border-border/40 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium">Last sync</p>
                <p className="text-[12px] text-muted">
                  Auto-syncs every 30 min
                </p>
              </div>
              <button
                onClick={triggerSync}
                disabled={syncing}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-3.5 text-[12px] font-medium text-muted transition-colors duration-150 hover:border-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} />
                )}
                {syncing ? "Syncing\u2026" : "Sync now"}
              </button>
            </div>
            {syncResult && (
              <div className="mt-3 rounded-[10px] border border-border/40 bg-background px-4 py-3 text-[12px]">
                <p>
                  Processed{" "}
                  <span className="font-mono font-medium">
                    {syncResult.processed}
                  </span>{" "}
                  clips &mdash;{" "}
                  <span className="font-mono text-green">
                    {syncResult.synced} updated
                  </span>
                  ,{" "}
                  <span className="font-mono text-muted">
                    {syncResult.skipped} skipped
                  </span>
                  ,{" "}
                  <span className="font-mono text-red">
                    {syncResult.errors} failed
                  </span>
                </p>
                <p className="mt-0.5 text-muted">
                  Duration: {(syncResult.duration / 1000).toFixed(1)}s
                </p>
              </div>
            )}
            <div className="mt-4 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">Campaigns</span>
                <span className="font-mono font-medium">
                  {campaigns.length} ({openCampaigns.length} open)
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px]">
                <span className="text-muted">Budget used</span>
                <span className="font-mono font-medium">
                  {rup(totalSpent)} / {rup(totalBudget)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Clip status */}
        <section>
          <h2 className="mb-4 text-[17px] font-bold tracking-tight">
            Clip status
          </h2>
          <div className="rounded-[14px] border border-border/40 bg-card p-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green" />
                  Approved
                </span>
                <span className="font-mono font-semibold">{approvedCount}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber" />
                  Pending
                </span>
                <span className="font-mono font-semibold">{pendingCount}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-muted" />
                  Paid
                </span>
                <span className="font-mono font-semibold">{paidCount}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red" />
                  Rejected
                </span>
                <span className="font-mono font-semibold">{rejectedCount}</span>
              </div>
            </div>
            <div className="mt-4 border-t border-border/40 pt-3">
              <Link
                href="/admin/clips"
                className="group flex items-center justify-between text-[13px] transition-colors hover:text-foreground"
              >
                <span className="text-muted">View all clips</span>
                <ArrowRight
                  size={13}
                  className="text-muted transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── Recent clips + Recent campaigns ─────────────── */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent clips */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              Recent clips
            </h2>
            <Link
              href="/admin/clips"
              className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              View all
              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
          <div className="divide-y divide-border/40 rounded-[14px] border border-border/40 bg-card">
            {recentClips.length === 0 ? (
              <p className="px-5 py-8 text-center text-[14px] text-muted">
                No clips yet.
              </p>
            ) : (
              recentClips.map((k) => {
                const c = campaigns.find((x) => x.id === k.campaignId);
                const thumb = c?.thumbnails?.[0];
                return (
                  <div
                    key={k.id}
                    className="flex items-center gap-3.5 px-4 py-3"
                  >
                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[8px] bg-accent-soft">
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <PlatformIcon
                            p={k.platform ?? "Instagram"}
                            size={12}
                          />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        @{k.clipper}
                      </p>
                      <p className="truncate text-[12px] text-muted">
                        {c?.title ?? "Campaign"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] tabular-nums">
                        {fmtViews(k.verifiedViews ?? 0)}
                      </span>
                      <StatusPill status={k.status} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Recent campaigns */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold tracking-tight">
              Recent campaigns
            </h2>
            <Link
              href="/admin/campaigns"
              className="group inline-flex items-center gap-1 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
            >
              View all
              <ArrowRight
                size={13}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
          <div className="divide-y divide-border/40 rounded-[14px] border border-border/40 bg-card">
            {recentCampaigns.length === 0 ? (
              <p className="px-5 py-8 text-center text-[14px] text-muted">
                No campaigns yet.
              </p>
            ) : (
              recentCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3.5 px-4 py-3"
                >
                  <div className="h-9 w-12 shrink-0 overflow-hidden rounded-[8px] bg-accent-soft">
                    {c.thumbnails?.[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.thumbnails[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PlatformIcon p={c.platform} size={12} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {c.title}
                    </p>
                    <p className="truncate text-[12px] text-muted">
                      {c.creator}
                    </p>
                  </div>
                  <StatusPill status={c.status} />
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* ── System overview ─────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-[17px] font-bold tracking-tight">
          System overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-[14px] border bg-card p-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-muted" />
              <p className="text-[12px] font-medium text-muted">
                Content Management
              </p>
            </div>
            <p className="mt-2 font-mono text-[20px] font-bold tracking-tight">
              {clips.length}
            </p>
          </div>
          <div className="rounded-[14px] border bg-card p-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-muted" />
              <p className="text-[12px] font-medium text-muted">
                Creator Reports
              </p>
            </div>
            <p className="mt-2 font-mono text-[20px] font-bold tracking-tight">
              {creators.length}
            </p>
          </div>
          <div className="rounded-[14px] border bg-card p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-muted" />
              <p className="text-[12px] font-medium text-muted">
                Open disputes
              </p>
            </div>
            <p className="mt-2 font-mono text-[20px] font-bold tracking-tight">
              0
            </p>
          </div>
          <div className="rounded-[14px] border bg-card p-4">
            <div className="flex items-center gap-2">
              <HeadphonesIcon size={16} className="text-muted" />
              <p className="text-[12px] font-medium text-muted">
                Support tickets
              </p>
            </div>
            <p className="mt-2 font-mono text-[20px] font-bold tracking-tight">
              0
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Metric Card
   ──────────────────────────────────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[14px] border bg-card p-4">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p
        className={`mt-2 font-mono text-[20px] font-bold leading-none tracking-tight ${valueClass ?? ""}`}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[11px] text-muted">{sub}</p>
      )}
    </div>
  );
}
