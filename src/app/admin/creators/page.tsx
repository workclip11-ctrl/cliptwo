"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Search,
  Ban,
  Check,
  ShieldCheck,
  BadgeCheck,
  BadgeX,
  History,
  X,
  Wallet,
  ExternalLink,
  ChevronRight,
  Users,
  Archive,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf } from "@/lib/finance";
import { seriesByDay, viewsByPlatform, spendByCampaign } from "@/lib/analytics";
import { TimeSeriesChart, BreakdownBars } from "@/components/charts";
import { TopClipsTable } from "@/components/TopClipsTable";
import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusPill } from "@/components/StatusPill";
import type { Campaign, Clip, Profile, FinanceRecord } from "@/lib/types";

const HIGH_SPEND_BUDGET = 30000;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "high", label: "High spend" },
  { key: "outstanding", label: "Outstanding payouts" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function fmtDate(t?: number) {
  if (!t) return "—";
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface Stats {
  campaigns: number;
  activeCampaigns: number;
  totalBudget: number;
  totalSpent: number;
  verifiedViews: number;
  clipsReceived: number;
  clipsApproved: number;
  outstanding: number;
  paid: number;
  myCampaigns: Campaign[];
  received: Clip[];
}

function creatorStats(
  p: Profile,
  campaigns: Campaign[],
  clips: Clip[],
  financeRecords: FinanceRecord[],
): Stats {
  const myCampaigns = campaigns.filter((c) => c.created_by === p.id);
  const myIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myIds.has(k.campaignId));
  const fin = financeOf(financeRecords, (r) => myIds.has(r.campaignId));
  return {
    campaigns: myCampaigns.length,
    activeCampaigns: myCampaigns.filter((c) => c.status === "open").length,
    totalBudget: myCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0),
    totalSpent: fin.total / 100,
    verifiedViews: received
      .filter((k) => k.status === "approved" || k.status === "held")
      .reduce((s, k) => s + (k.verifiedViews ?? 0), 0),
    clipsReceived: received.length,
    clipsApproved: fin.totalCount,
    outstanding: (fin.total - fin.paid) / 100,
    paid: fin.paid / 100,
    myCampaigns,
    received,
  };
}

export default function AdminCreators() {
  const { profiles, campaigns, clips, financeRecords } = useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = profiles.filter((p) => p.role === "creator");
    const matched = list.filter((p) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.company ?? "").toLowerCase().includes(needle) ||
        (p.email ?? "").toLowerCase().includes(needle)
      );
    });
    return matched.filter((p) => {
      const s = creatorStats(p, campaigns, clips, financeRecords);
      switch (filter) {
        case "verified":
          return !!p.verified;
        case "unverified":
          return !p.verified;
        case "active":
          return p.status === "active";
        case "suspended":
          return p.status === "suspended";
        case "high":
          return s.totalBudget >= HIGH_SPEND_BUDGET;
        case "outstanding":
          return s.outstanding > 0;
        default:
          return true;
      }
    });
  }, [profiles, campaigns, clips, financeRecords, q, filter]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Creators
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {rows.length} of {profiles.filter((p) => p.role === "creator").length} accounts
          {q || filter !== "all" ? " (filtered)" : ""}
        </p>
      </div>

      {/* ── Search + filters ────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, brand or email"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`cursor-pointer rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                filter === f.key
                  ? "bg-foreground text-background"
                  : "border border-border/50 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[14px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                <th className="px-5 py-3 font-medium">Creator</th>
                <th className="px-5 py-3 font-medium">Company / brand</th>
                <th className="px-5 py-3 text-right font-medium">Campaigns</th>
                <th className="px-5 py-3 text-right font-medium">Budget</th>
                <th className="px-5 py-3 text-right font-medium">Spent</th>
                <th className="px-5 py-3 text-right font-medium">Verified views</th>
                <th className="px-5 py-3 text-right font-medium">Clips</th>
                <th className="px-5 py-3 text-center font-medium">Payment</th>
                <th className="px-5 py-3 text-center font-medium">Status</th>
                <th className="px-5 py-3 text-center font-medium">Joined</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((p) => {
                const s = creatorStats(p, campaigns, clips, financeRecords);
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer transition-colors hover:bg-accent-soft/50"
                  >
                    {/* Creator */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-foreground">
                          {(p.name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium">{p.name}</span>
                        {p.verified && (
                          <BadgeCheck size={14} className="shrink-0 text-green" />
                        )}
                      </div>
                    </td>

                    {/* Company / brand */}
                    <td className="px-5 py-4 text-[14px] text-muted">
                      {p.company ?? "—"}
                    </td>

                    {/* Campaigns */}
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono font-medium">{s.campaigns}</span>
                      {s.activeCampaigns > 0 && (
                        <p className="text-[12px] text-green">{s.activeCampaigns} active</p>
                      )}
                    </td>

                    {/* Budget */}
                    <td className="px-5 py-4 text-right font-mono font-medium">
                      {rup(s.totalBudget)}
                    </td>

                    {/* Spent */}
                    <td className="px-5 py-4 text-right font-mono font-medium">
                      {rup(s.totalSpent)}
                    </td>

                    {/* Verified views */}
                    <td className="px-5 py-4 text-right font-mono">
                      {fmtViews(s.verifiedViews)}
                    </td>

                    {/* Clips */}
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono font-medium">{s.clipsReceived}</span>
                      {s.clipsApproved > 0 && (
                        <p className="text-[12px] text-green">{s.clipsApproved} approved</p>
                      )}
                    </td>

                    {/* Payment */}
                    <td className="px-5 py-4 text-center">
                      {s.outstanding > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-amber/10 px-2.5 py-0.5 text-[12px] font-medium text-amber">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green/10 px-2.5 py-0.5 text-[12px] font-medium text-green">
                          Settled
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                          p.status === "suspended"
                            ? "bg-red/10 text-red"
                            : "bg-green/10 text-green"
                        }`}
                      >
                        {p.status === "suspended" ? "Suspended" : "Active"}
                      </span>
                    </td>

                    {/* Joined */}
                    <td className="px-5 py-4 text-center text-[13px] text-muted">
                      {fmtDate(p.createdAt)}
                    </td>

                    {/* Chevron */}
                    <td className="px-5 py-4 text-right">
                      <ChevronRight size={16} className="ml-auto text-muted" />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center">
                    <p className="text-[15px] font-medium">No creators found</p>
                    <p className="mt-1 text-[13px] text-muted">
                      {profiles.filter((p) => p.role === "creator").length === 0
                        ? "No creator accounts exist yet."
                        : "Try adjusting your search or filters."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drawer ──────────────────────────────────────── */}
      {selected && (
        <CreatorDrawer
          key={selected.id}
          profile={selected}
          campaigns={campaigns}
          clips={clips}
          canSuspend={true}
          actor={user?.email}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

/* ================================================================
   DRAWER
   ================================================================ */

function CreatorDrawer({
  profile,
  campaigns,
  clips,
  canSuspend,
  actor,
  onClose,
}: {
  profile: Profile;
  campaigns: Campaign[];
  clips: Clip[];
  canSuspend: boolean;
  actor?: string;
  onClose: () => void;
}) {
  const { verifyProfile, updateProfileStatus, saveAdminNotes, deactivateProfile, deleteProfile, financeRecords } = useStore();
  const stats = creatorStats(profile, campaigns, clips, financeRecords);
  const suspended = profile.status === "suspended";
  const deactivated = profile.status === "deactivated";
  const [notes, setNotes] = useState(profile.adminNotes ?? "");
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const viewsSeries = seriesByDay(stats.received, (k) => k.verifiedViews ?? 0);
  const spendSeries = seriesByDay(stats.received, (k) => clipEarnings(k, campaigns));
  const platformBreakdown = viewsByPlatform(stats.received);
  const currentCampaigns = stats.myCampaigns.filter(
    (c) => c.status === "open" || c.status === "paused",
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 cursor-pointer bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-card shadow-xl">
        {/* ── Header ────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border/40 bg-card px-7 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[20px] font-bold tracking-tight">
                {profile.name}
              </h2>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                  suspended
                    ? "bg-red/10 text-red"
                    : "bg-green/10 text-green"
                }`}
              >
                {suspended ? "Suspended" : "Active"}
              </span>
              {profile.verified && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green/10 px-2.5 py-0.5 text-[12px] font-medium text-green">
                  <BadgeCheck size={12} /> Verified
                </span>
              )}
            </div>
            <p className="mt-1 text-[14px] text-muted">
              {profile.company ?? "—"} · {profile.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-border/40 transition-colors hover:bg-accent-soft"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Actions ───────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 border-b border-border/40 px-7 py-3.5">
          {suspended ? (
            <ActionButton
              icon={<Check size={14} />}
              label="Reactivate"
              onClick={() => updateProfileStatus(profile.id, "active", actor)}
              primary
            />
          ) : (
            <ActionButton
              icon={<Ban size={14} />}
              label="Suspend"
              disabled={!canSuspend}
              onClick={() => setShowSuspend(true)}
              danger
            />
          )}
          <ActionButton
            icon={profile.verified ? <BadgeX size={14} /> : <ShieldCheck size={14} />}
            label={profile.verified ? "Unverify" : "Verify"}
            onClick={() => verifyProfile(profile.id, actor ?? "", !profile.verified)}
          />
          <Link
            href="/admin/campaigns"
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 px-3.5 text-[14px] font-medium transition-colors hover:bg-accent-soft"
          >
            <ExternalLink size={14} /> View campaigns
          </Link>
        </div>

        {/* ── Suspend reason inline ─────────────────────── */}
        {!suspended && showSuspend && (
          <div className="border-b border-border/40 bg-red/5 px-7 py-4">
            <label className="text-[13px] font-medium text-muted">
              Suspension reason (required)
            </label>
            <div className="mt-2 flex gap-2">
              <input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Repeated campaign rule violations"
                className="flex-1 rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
              />
              <button
                onClick={() => {
                  if (!suspendReason.trim()) {
                    alert("Add a reason before suspending the account.");
                    return;
                  }
                  updateProfileStatus(profile.id, "suspended", actor, suspendReason.trim());
                  setShowSuspend(false);
                  setSuspendReason("");
                }}
                className="cursor-pointer rounded-[8px] bg-red px-4 py-2.5 text-[14px] font-medium text-white"
              >
                Suspend
              </button>
            </div>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────── */}
        <div className="space-y-8 px-7 py-6">
          {/* Key metrics */}
          <Section title="Overview">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MetricRow label="Campaigns" value={String(stats.campaigns)} />
                <MetricRow label="Active campaigns" value={String(stats.activeCampaigns)} />
                <MetricRow label="Clips received" value={String(stats.clipsReceived)} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricRow label="Total budget" value={rup(stats.totalBudget)} />
                <MetricRow label="Total spent" value={rup(stats.totalSpent)} />
                <MetricRow label="Verified views" value={fmtViews(stats.verifiedViews)} />
                <MetricRow label="Clips approved" value={String(stats.clipsApproved)} />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MetricRow label="Outstanding" value={rup(stats.outstanding)} />
                <MetricRow label="Paid" value={rup(stats.paid)} />
              </div>
            </div>
          </Section>

          {/* Campaign history */}
          <Section title="Campaign history">
            {stats.myCampaigns.length === 0 ? (
              <p className="text-[14px] text-muted">No campaigns yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.myCampaigns.map((c) => {
                  const campFin = financeOf(
                    financeRecords,
                    (r) => r.campaignId === c.id,
                  );
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                    >
                      <div>
                        <p className="font-medium">{c.title}</p>
                        <p className="text-[13px] text-muted">
                          Budget {rup(c.budget ?? 0)} · Spent {rup(campFin.total)} ·{" "}
                          {stats.received.filter((k) => k.campaignId === c.id).length} clips
                        </p>
                      </div>
                      <StatusPill status={c.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Current campaigns */}
          <Section title="Current campaigns">
            {currentCampaigns.length === 0 ? (
              <p className="text-[14px] text-muted">No active campaigns running.</p>
            ) : (
              <ul className="space-y-2">
                {currentCampaigns.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                  >
                    <span className="font-medium">{c.title}</span>
                    <StatusPill status={c.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Submissions */}
          <Section
            title="Submissions"
            action={
              <Link
                href="/admin/clips"
                className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-foreground hover:underline"
              >
                Open review <ExternalLink size={12} />
              </Link>
            }
          >
            {stats.received.length === 0 ? (
              <p className="text-[14px] text-muted">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                      <th className="px-3 py-2.5 font-medium">Campaign</th>
                      <th className="px-3 py-2.5 font-medium">Clipper</th>
                      <th className="px-3 py-2.5 font-medium">Platform</th>
                      <th className="px-3 py-2.5 text-right font-medium">Views</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {stats.received.map((k) => {
                      const camp = campaigns.find((c) => c.id === k.campaignId);
                      return (
                        <tr key={k.id}>
                          <td className="px-3 py-3">
                            <div className="font-medium">{camp?.title ?? k.campaignId}</div>
                            <div className="text-[13px] text-muted">{k.caption}</div>
                          </td>
                          <td className="px-3 py-3 font-medium">@{k.clipper}</td>
                          <td className="px-3 py-3">
                            <PlatformIcon p={k.platform ?? "Instagram"} size={14} />
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {fmtViews(k.verifiedViews ?? 0)}
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill status={k.status} />
                          </td>
                          <td className="px-3 py-3 text-right font-mono">
                            {rup(clipEarnings(k, campaigns))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Spending */}
          <Section title="Spending">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricRow label="Total budget" value={rup(stats.totalBudget)} />
                <MetricRow label="Committed" value={rup(stats.totalSpent)} />
                <MetricRow label="Paid out" value={rup(stats.paid)} />
                <MetricRow label="Outstanding" value={rup(stats.outstanding)} />
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-muted">Spend by campaign</p>
              <BreakdownBars
                items={spendByCampaign(stats.received, campaigns).map((b) => ({
                  label: b.label,
                  value: b.value,
                }))}
                format={rup}
              />
            </div>
          </Section>

          {/* Payments */}
          <Section title="Payments">
            <p className="text-[14px] text-muted">
              {stats.outstanding > 0
                ? `${rup(stats.outstanding)} is pending release to clippers.`
                : "All clipper payouts are settled."}
            </p>
            <div className="mt-3 space-y-2">
              {stats.received
                .filter((k) => k.status === "approved" || k.status === "held")
                .map((k) => {
                  const camp = campaigns.find((c) => c.id === k.campaignId);
                  const released = false;
                  return (
                    <div
                      key={k.id}
                      className="flex items-center justify-between rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Wallet size={14} className="text-muted" />
                        <span className="font-medium">{camp?.title ?? k.campaignId}</span>
                        <span className="text-[13px] text-muted">@{k.clipper}</span>
                        <StatusPill status={k.status} />
                      </span>
                      <span
                        className={`font-mono font-medium ${released ? "" : "text-amber"}`}
                      >
                        {rup(clipEarnings(k, campaigns))}
                      </span>
                    </div>
                  );
                })}
              {stats.received.filter((k) => k.status === "approved" || k.status === "held").length === 0 && (
                <p className="text-[14px] text-muted">No payouts yet.</p>
              )}
            </div>
          </Section>

          {/* Analytics */}
          <Section title="Analytics">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[13px] text-muted">Verified views over time</p>
                <TimeSeriesChart data={viewsSeries} format={fmtViews} />
              </div>
              <div>
                <p className="mb-2 text-[13px] text-muted">Spend over time</p>
                <TimeSeriesChart data={spendSeries} format={rup} />
              </div>
            </div>
            <div className="mt-5">
              <p className="mb-2 text-[13px] text-muted">Views by platform</p>
              <BreakdownBars items={platformBreakdown} format={fmtViews} />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-[13px] text-muted">Top clips</p>
              <TopClipsTable clips={stats.received} campaigns={campaigns} />
            </div>
          </Section>

          {/* Team members */}
          <Section title="Team members">
            {!profile.team || profile.team.length === 0 ? (
              <p className="text-[14px] text-muted">Solo account — no team members.</p>
            ) : (
              <ul className="space-y-2">
                {profile.team.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                  >
                    <Users size={14} className="text-muted" />
                    <span className="font-medium">{m.name}</span>
                    {m.role && <span className="text-[13px] text-muted">· {m.role}</span>}
                    {m.email && <span className="text-[13px] text-muted">· {m.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Admin notes */}
          <Section title="Admin notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this creator/brand"
              className="w-full rounded-[8px] border border-border/60 bg-background px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
            />
            <button
              onClick={() => saveAdminNotes(profile.id, notes, actor ?? "")}
              className="mt-2 cursor-pointer rounded-[8px] bg-foreground px-4 py-2.5 text-[14px] font-medium text-background"
            >
              Save notes
            </button>
          </Section>

          {/* Audit history */}
          <Section title="Audit history">
            {!profile.audit || profile.audit.length === 0 ? (
              <p className="text-[14px] text-muted">No audit entries.</p>
            ) : (
              <ul className="space-y-3">
                {[...profile.audit].reverse().map((e, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[14px]">
                    <History size={14} className="mt-0.5 shrink-0 text-muted" />
                    <div>
                      <span className="font-medium">{e.action}</span>
                      {e.by && <span className="text-muted"> by {e.by}</span>}
                      <span className="text-muted"> · {fmtDate(e.at)}</span>
                      {e.note && (
                        <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* ── Danger zone ──────────────────────────────── */}
          <div className="border-t border-border/40 pt-6 space-y-3">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
              Account management
            </p>
            {deactivated ? (
              <p className="text-[14px] text-muted">
                This account was deactivated. Profile data has been anonymized and login is blocked.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    if (confirm(`Deactivate creator ${profile.name}?\n\nThis will anonymize their profile data and block future logins. All financial and audit records will be preserved.`))
                      deactivateProfile(profile.id, "Admin deactivation from creator dashboard");
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-amber-500/30 px-3.5 text-[14px] font-medium text-amber-600 transition-colors hover:bg-amber-500/10"
                >
                  <Archive size={14} /> Deactivate account
                </button>
                <button
                  onClick={() => {
                    if (confirm(`PERMANENTLY delete creator ${profile.name}?\n\nThis will remove their auth account and all associated data. This cannot be undone.\n\nNote: If the user has financial records, the deletion will be blocked.`))
                      deleteProfile(profile.id);
                  }}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border border-red/30 px-3.5 text-[14px] font-medium text-red transition-colors hover:bg-red/10"
                >
                  <Trash2 size={14} /> Delete account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-border/40 bg-background px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-mono text-[16px] font-semibold">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  primary,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Insufficient permissions" : label}
      className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border px-3.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "border-foreground bg-foreground text-background hover:opacity-90"
          : danger
            ? "border-red/30 text-red hover:bg-red/10"
            : "border-border/60 text-foreground hover:bg-accent-soft"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
