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
  AlertTriangle,
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
    totalSpent: fin.total,
    verifiedViews: received
      .filter((k) => k.status === "approved" || k.status === "held")
      .reduce((s, k) => s + k.views, 0),
    clipsReceived: received.length,
    clipsApproved: fin.totalCount,
    outstanding: fin.total - fin.paid,
    paid: fin.paid,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Creators</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} of {profiles.filter((p) => p.role === "creator").length} creator
          accounts
          {q || filter !== "all" ? " (filtered)" : ""}.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, brand or email"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "border-foreground bg-accent-soft text-foreground"
                  : "text-muted hover:bg-accent-soft/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Company / brand</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 text-right font-medium">Campaigns</th>
                <th className="px-4 py-3 text-right font-medium">Active</th>
                <th className="px-4 py-3 text-right font-medium">Budget</th>
                <th className="px-4 py-3 text-right font-medium">Spent</th>
                <th className="px-4 py-3 text-right font-medium">Verified views</th>
                <th className="px-4 py-3 text-right font-medium">Clips recv.</th>
                <th className="px-4 py-3 text-right font-medium">Approved</th>
                <th className="px-4 py-3 text-center font-medium">Payment</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Joined</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => {
                const s = creatorStats(p, campaigns, clips, financeRecords);
                const suspended = p.status === "suspended";
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer hover:bg-accent-soft/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold">
                          {(p.name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium">{p.name}</span>
                        {p.verified && (
                          <BadgeCheck size={13} className="text-green" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.company ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{p.email}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.campaigns}</td>
                    <td className="px-4 py-3 text-right font-mono text-green">
                      {s.activeCampaigns}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{rup(s.totalBudget)}</td>
                    <td className="px-4 py-3 text-right font-mono">{rup(s.totalSpent)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {fmtViews(s.verifiedViews)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{s.clipsReceived}</td>
                    <td className="px-4 py-3 text-right font-mono text-green">
                      {s.clipsApproved}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.outstanding > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-xs font-medium text-amber">
                          <AlertTriangle size={11} /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green">
                          Settled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <AccountBadge suspended={suspended} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted">
                      {fmtDate(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight size={15} className="ml-auto text-muted" />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-10 text-center text-muted">
                    No creator accounts{profiles.length ? " match your filters" : " yet"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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

function AccountBadge({ suspended }: { suspended: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        suspended
          ? "bg-red/10 text-red border-red/20"
          : "bg-green/10 text-green border-green/20"
      }`}
    >
      {suspended ? "Suspended" : "Active"}
    </span>
  );
}

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

  const viewsSeries = seriesByDay(stats.received, (k) => k.views);
  const spendSeries = seriesByDay(stats.received, (k) => clipEarnings(k, campaigns));
  const platformBreakdown = viewsByPlatform(stats.received);
  const currentCampaigns = stats.myCampaigns.filter(
    (c) => c.status === "open" || c.status === "paused",
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-card shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{profile.name}</h2>
              <AccountBadge suspended={suspended} />
              {profile.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-xs font-medium text-green">
                  <BadgeCheck size={12} /> Verified
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {profile.company ?? "—"} · {profile.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border p-1.5 hover:bg-accent-soft"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-b px-6 py-3">
          {suspended ? (
            <ActionButton
              icon={<Check size={14} />}
              label="Reactivate"
              onClick={() => updateProfileStatus(profile.id, "active", actor)}
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
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
          >
            <ExternalLink size={14} /> View campaigns
          </Link>
        </div>

        {!suspended && showSuspend && (
          <div className="border-b bg-accent-soft/40 px-6 py-3">
            <label className="text-xs font-medium text-muted">
              Suspension reason (required)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Repeated campaign rule violations"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
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
                className="rounded-lg bg-red px-3 py-2 text-sm font-medium text-white"
              >
                Suspend
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6 px-6 py-5">
          {/* Account status */}
          <Section title="Account status">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <AccountBadge suspended={suspended} />
              {profile.verified ? (
                <span className="inline-flex items-center gap-1 text-green">
                  <BadgeCheck size={13} /> Verified brand
                </span>
              ) : (
                <span className="text-muted">Unverified brand</span>
              )}
              <span className="text-muted">Joined {fmtDate(profile.createdAt)}</span>
              {profile.suspendedReason && (
                <span className="text-red">· {profile.suspendedReason}</span>
              )}
            </div>
          </Section>

          {/* Campaign history */}
          <Section title="Campaign history">
            {stats.myCampaigns.length === 0 ? (
              <p className="text-sm text-muted">No campaigns yet.</p>
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
                      className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{c.title}</p>
                        <p className="text-xs text-muted">
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
              <p className="text-sm text-muted">No active campaigns running.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {currentCampaigns.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-full border bg-accent-soft px-3 py-1 text-xs font-medium"
                  >
                    {c.title}
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
                className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
              >
                Open review <ExternalLink size={12} />
              </Link>
            }
          >
            {stats.received.length === 0 ? (
              <p className="text-sm text-muted">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted">
                      <th className="px-2 py-2 font-medium">Campaign</th>
                      <th className="px-2 py-2 font-medium">Clipper</th>
                      <th className="px-2 py-2 font-medium">Platform</th>
                      <th className="px-2 py-2 text-right font-medium">Views</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 text-right font-medium">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stats.received.map((k) => {
                      const camp = campaigns.find((c) => c.id === k.campaignId);
                      return (
                        <tr key={k.id}>
                          <td className="px-2 py-2">
                            <div className="font-medium">{camp?.title ?? k.campaignId}</div>
                            <div className="text-xs text-muted">{k.caption}</div>
                          </td>
                          <td className="px-2 py-2 font-medium">@{k.clipper}</td>
                          <td className="px-2 py-2">
                            <PlatformIcon p={k.platform ?? "Instagram"} size={14} />
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
                            {fmtViews(k.views)}
                          </td>
                          <td className="px-2 py-2">
                            <StatusPill status={k.status} />
                          </td>
                          <td className="px-2 py-2 text-right font-mono">
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total budget" value={rup(stats.totalBudget)} />
              <Stat label="Committed" value={rup(stats.totalSpent)} />
              <Stat label="Paid out" value={rup(stats.paid)} />
              <Stat label="Outstanding" value={rup(stats.outstanding)} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted">Spend by campaign</p>
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
            <p className="text-sm text-muted">
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
                      className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Wallet size={14} className="text-muted" />
                        <span className="font-medium">{camp?.title ?? k.campaignId}</span>
                        <span className="text-xs text-muted">@{k.clipper}</span>
                        <StatusPill status={k.status} />
                      </span>
                      <span
                        className={`font-mono ${released ? "" : "text-amber"}`}
                      >
                        {rup(clipEarnings(k, campaigns))}
                      </span>
                    </div>
                  );
                })}
              {stats.received.filter((k) => k.status === "approved" || k.status === "held").length === 0 && (
                <p className="text-sm text-muted">No payouts yet.</p>
              )}
            </div>
          </Section>

          {/* Analytics */}
          <Section title="Analytics">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted">Verified views over time</p>
                <TimeSeriesChart data={viewsSeries} format={fmtViews} />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted">Spend over time</p>
                <TimeSeriesChart data={spendSeries} format={rup} />
              </div>
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted">Views by platform</p>
              <BreakdownBars items={platformBreakdown} format={fmtViews} />
            </div>
            <div className="mt-4">
              <p className="mb-1 text-xs text-muted">Top clips</p>
              <TopClipsTable clips={stats.received} campaigns={campaigns} />
            </div>
          </Section>

          {/* Team members */}
          <Section title="Team members">
            {!profile.team || profile.team.length === 0 ? (
              <p className="text-sm text-muted">Solo account — no team members.</p>
            ) : (
              <ul className="space-y-2">
                {profile.team.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <Users size={14} className="text-muted" />
                    <span className="font-medium">{m.name}</span>
                    {m.role && <span className="text-xs text-muted">· {m.role}</span>}
                    {m.email && <span className="text-xs text-muted">· {m.email}</span>}
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
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <button
              onClick={() => saveAdminNotes(profile.id, notes, actor ?? "")}
              className="mt-2 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              Save notes
            </button>
          </Section>

          {/* Audit history */}
          <Section title="Audit history">
            {!profile.audit || profile.audit.length === 0 ? (
              <p className="text-sm text-muted">No audit entries.</p>
            ) : (
              <ul className="space-y-2">
                {[...profile.audit].reverse().map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <History size={14} className="mt-0.5 shrink-0 text-muted" />
                    <div>
                      <span className="font-medium">{e.action}</span>
                      {e.by && <span className="text-muted"> by {e.by}</span>}
                      <span className="text-muted"> · {fmtDate(e.at)}</span>
                      {e.note && <p className="text-muted">{e.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="border-t pt-4 space-y-2">
            {deactivated ? (
              <p className="text-sm text-muted">
                This account was deactivated. Profile data has been anonymized and login is blocked.
              </p>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (confirm(`Deactivate creator ${profile.name}?\n\nThis will anonymize their profile data and block future logins. All financial and audit records will be preserved.`))
                      deactivateProfile(profile.id, "Admin deactivation from creator dashboard");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-sm font-medium text-amber-600 hover:bg-amber-500/10"
                >
                  <Archive size={14} /> Deactivate account
                </button>
                <button
                  onClick={() => {
                    if (confirm(`PERMANENTLY delete creator ${profile.name}?\n\nThis will remove their auth account and all associated data. This cannot be undone.\n\nNote: If the user has financial records, the deletion will be blocked.`))
                      deleteProfile(profile.id);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red/30 px-3 py-1.5 text-sm font-medium text-red hover:bg-red/10"
                >
                  <Trash2 size={14} /> Delete account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-mono text-base font-semibold">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger ? "border-red/30 text-red hover:bg-red/10" : "hover:bg-accent-soft"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
