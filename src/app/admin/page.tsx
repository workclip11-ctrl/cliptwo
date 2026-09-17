"use client";

import { useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Loader2,
  ArrowRight,
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
  const admins = profiles.filter((p) => p.role === "admin");

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
    .slice(0, 6);
  const recentCampaigns = [...campaigns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-[1120px] space-y-12 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <section>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
          Operations
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          ClipTwo activity, review queues, payouts, and campaign health.
        </p>
      </section>

      {/* ── Primary metric ──────────────────────────────── */}
      <section>
        <div className="rounded-[14px] border bg-card px-5 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[13px] font-medium text-muted">
                Pending review
              </p>
              <p className="mt-2 font-mono text-[32px] font-bold leading-none tracking-tight">
                {pendingCount}
              </p>
              <p className="mt-1.5 text-[13px] text-muted">
                Clips awaiting an approve / reject decision
              </p>
            </div>

            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Clippers</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {clippers.length}
                </p>
              </div>
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Creators</p>
                <p className="mt-1 font-mono text-lg font-bold">
                  {creators.length}
                </p>
              </div>
              <div className="min-w-[100px]">
                <p className="text-[13px] text-muted">Paid out</p>
                <p className="mt-1 font-mono text-lg font-bold text-green">
                  {rup(paidOut)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Action queues ───────────────────────────────── */}
      <section>
        <h2 className="mb-5 text-[20px] font-bold tracking-tight">
          Action queues
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            href="/admin/clips?filter=pending"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">
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
            <p className="mt-1 text-[13px] text-muted">
              clips need a decision
            </p>
          </Link>

          <Link
            href="/admin/clips?filter=payable"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">
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
            <p className="mt-1 text-[13px] text-muted">
              earned, not yet released
            </p>
          </Link>

          <Link
            href="/admin/clips?filter=paid"
            className="group rounded-[14px] border border-border/40 bg-card p-5 transition-colors duration-150 hover:border-foreground/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">
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
            <p className="mt-1 text-[13px] text-muted">
              {paidCount} clips paid
            </p>
          </Link>
        </div>
      </section>

      {/* ── Metrics sync ────────────────────────────────── */}
      <section>
        <div className="rounded-[14px] border border-border/40 bg-card px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium">Metrics sync</p>
              <p className="text-[13px] text-muted">
                Auto-syncs every 30 min. Trigger an immediate system-wide sync.
              </p>
            </div>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border/60 px-3.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:border-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
            >
              {syncing ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {syncing ? "Syncing\u2026" : "Sync now"}
            </button>
          </div>
          {syncResult && (
            <div className="mt-3 rounded-[10px] border border-border/40 bg-background px-4 py-3 text-[13px]">
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
        </div>
      </section>

      {/* ── Clip status + operational info ───────────────── */}
      <section>
        <h2 className="mb-5 text-[20px] font-bold tracking-tight">
          Platform overview
        </h2>
        <div className="rounded-[14px] border border-border/40 bg-card p-5 sm:p-6">
          {/* Status breakdown */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[14px]">
            <span>
              <span className="text-muted">Pending </span>
              <span className="font-mono font-semibold">{pendingCount}</span>
            </span>
            <span>
              <span className="text-muted">Total clips </span>
              <span className="font-mono font-semibold">{approvedCount}</span>
            </span>
            <span>
              <span className="text-muted">Paid </span>
              <span className="font-mono font-semibold">{paidCount}</span>
            </span>
            <span>
              <span className="text-muted">Rejected </span>
              <span className="font-mono font-semibold">{rejectedCount}</span>
            </span>
          </div>

          <div className="my-4 border-t border-border/40" />

          {/* Operational info */}
          <div className="space-y-2.5 text-[14px]">
            <div className="flex items-center justify-between">
              <span className="text-muted">Total earned (all time)</span>
              <span className="font-mono font-medium">{rup(totalEarned)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Campaigns</span>
              <span className="font-mono font-medium">
                {campaigns.length} ({openCampaigns.length} open)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Budget used</span>
              <span className="font-mono font-medium">
                {rup(totalSpent)} / {rup(totalBudget)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Staff (admin)</span>
              <span className="font-mono font-medium">{admins.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent clips ────────────────────────────────── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold tracking-tight">Recent clips</h2>
          <Link
            href="/admin/clips"
            className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
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
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  {/* Thumbnail */}
                  <div className="h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft">
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
                          size={14}
                        />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      @{k.clipper}
                    </p>
                    <p className="truncate text-[13px] text-muted">
                      {c?.title ?? "Campaign"}
                    </p>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] tabular-nums">
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

      {/* ── Recent campaigns ────────────────────────────── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-[20px] font-bold tracking-tight">
            Recent campaigns
          </h2>
          <Link
            href="/admin/campaigns"
            className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
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
                className="flex items-center gap-4 px-5 py-3.5"
              >
                {/* Thumbnail */}
                <div className="h-10 w-14 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft">
                  {c.thumbnails?.[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={c.thumbnails[0]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <PlatformIcon p={c.platform} size={14} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{c.title}</p>
                  <p className="truncate text-[13px] text-muted">{c.creator}</p>
                </div>

                <StatusPill status={c.status} />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
