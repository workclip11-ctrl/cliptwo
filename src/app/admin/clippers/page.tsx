"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Search,
  Ban,
  Check,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  X,
  Wallet,
  BadgeCheck,
  BadgeX,
  FileText,
  History,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  calculateClipperReputation,
  calculateReputationScore,
} from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";

import { PlatformIcon } from "@/components/PlatformIcon";
import { StatusPill } from "@/components/StatusPill";
import { canAdmin, type AdminPermission } from "@/lib/permissions";
import type { Appeal, Clip, Campaign, Profile, SocialAccount, FinanceRecord } from "@/lib/types";

const HIGH_PERF_EARNED = 5000;

const FILTERS = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "high", label: "High performers" },
  { key: "risk", label: "Risk flagged" },
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

function fmtDateTime(t?: number) {
  if (!t) return "—";
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Stats {
  total: number;
  approved: number;
  rejected: number;
  approvalRate: number | null;
  verifiedViews: number;
  earned: number;
  paid: number;
  own: Clip[];
}

function clipperStats(
  p: Profile,
  clips: Clip[],
  campaigns: Campaign[],
  financeRecords: FinanceRecord[],
): Stats {
  const own = clips.filter((k) => k.clipper === p.username);
  const earned = own.filter((k) => k.status === "approved" || k.status === "held");
  const approved = own.filter(
    (k) => k.status === "approved" || k.status === "held",
  ).length;
  const rejected = own.filter((k) => k.status === "rejected").length;
  const approvalRate =
    approved + rejected > 0
      ? Math.round((approved / (approved + rejected)) * 100)
      : null;
  const verifiedViews = earned.reduce((s, k) => s + (k.verifiedViews ?? 0), 0);
  const earnedAmt = earned.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const paid = own
    .filter((k) => k.status === "approved" && financeRecords.some((r) => r.clipId === k.id && r.status === "paid"))
    .reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  return { total: own.length, approved, rejected, approvalRate, verifiedViews, earned: earnedAmt, paid, own };
}

function accountsFor(p: Profile, accounts: SocialAccount[]) {
  return accounts.filter(
    (a) => a.userId === p.id || a.handle.replace(/^@/, "") === p.username,
  );
}

export default function AdminClippers() {
  const { profiles, clips, campaigns, financeRecords, socialAccounts } = useStore();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const can = (perm: AdminPermission) => canAdmin(user, perm);

  const rows = useMemo(() => {
    const list = profiles.filter((p) => p.role === "clipper");
    const matched = list.filter((p) => {
      if (!q) return true;
      const needle = q.toLowerCase();
      return (
        (p.name ?? "").toLowerCase().includes(needle) ||
        (p.username ?? "").toLowerCase().includes(needle) ||
        (p.email ?? "").toLowerCase().includes(needle)
      );
    });
    return matched.filter((p) => {
      const s = clipperStats(p, clips, campaigns, financeRecords);
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
          return s.earned >= HIGH_PERF_EARNED;
        case "risk":
          return !!p.riskFlag;
        default:
          return true;
      }
    });
  }, [profiles, clips, campaigns, q, filter, financeRecords]);

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Clippers
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          {rows.length} of {profiles.filter((p) => p.role === "clipper").length} accounts
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
            placeholder="Search name, username or email"
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
          <table className="w-full min-w-[960px] text-[14px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                <th className="px-5 py-3 font-medium">Clipper</th>
                <th className="px-5 py-3 font-medium">Social accounts</th>
                <th className="px-5 py-3 text-right font-medium">Clips</th>
                <th className="px-5 py-3 text-right font-medium">Approval</th>
                <th className="px-5 py-3 text-right font-medium">Verified views</th>
                <th className="px-5 py-3 text-right font-medium">Earned</th>
                <th className="px-5 py-3 text-center font-medium">Status</th>
                <th className="px-5 py-3 text-center font-medium">Joined</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((p) => {
                const s = clipperStats(p, clips, campaigns, financeRecords);
                const accs = accountsFor(p, socialAccounts);
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer transition-colors hover:bg-accent-soft/50"
                  >
                    {/* Clipper */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-foreground">
                          {(p.name ?? p.username ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{p.name}</span>
                            {p.riskFlag && (
                              <span className="inline-flex shrink-0 items-center gap-0.5 text-red">
                                <AlertTriangle size={12} />
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[13px] text-muted">@{p.username}</p>
                        </div>
                      </div>
                    </td>

                    {/* Social accounts */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {accs.length === 0 ? (
                          <span className="text-[13px] text-muted">None</span>
                        ) : (
                          accs.map((a) => (
                            <span
                              key={a.id}
                              title={`${a.handle} · ${a.status}`}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${
                                a.verified
                                  ? "border-green/20 bg-green/10 text-green"
                                  : "border-border/40 bg-accent-soft text-muted"
                              }`}
                            >
                              <PlatformIcon p={a.platform} size={13} />
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Clips */}
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono font-medium">{s.total}</span>
                      {(s.approved > 0 || s.rejected > 0) && (
                        <p className="text-[12px] text-muted">
                          <span className="text-green">{s.approved}</span>
                          {" / "}
                          <span className="text-red">{s.rejected}</span>
                        </p>
                      )}
                    </td>

                    {/* Approval */}
                    <td className="px-5 py-4 text-right">
                      <span className="font-mono font-medium">
                        {s.approvalRate === null ? "—" : `${s.approvalRate}%`}
                      </span>
                      {(s.approved > 0 || s.rejected > 0) && (
                        <p className="text-[12px] text-muted">
                          {s.approved} / {s.rejected}
                        </p>
                      )}
                    </td>

                    {/* Verified views */}
                    <td className="px-5 py-4 text-right font-mono">
                      {fmtViews(s.verifiedViews)}
                    </td>

                    {/* Earned */}
                    <td className="px-5 py-4 text-right font-mono font-medium">
                      {rup(s.earned)}
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
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <p className="text-[15px] font-medium">No clippers found</p>
                    <p className="mt-1 text-[13px] text-muted">
                      {profiles.length === 0
                        ? "No clipper accounts exist yet."
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
        <ClipperDrawer
          key={selected.id}
          profile={selected}
          clips={clips}
          campaigns={campaigns}
          socialAccounts={socialAccounts}
          can={can}
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

function ClipperDrawer({
  profile,
  clips,
  campaigns,
  socialAccounts,
  can,
  actor,
  onClose,
}: {
  profile: Profile;
  clips: Clip[];
  campaigns: Campaign[];
  socialAccounts: SocialAccount[];
  can: (perm: AdminPermission) => boolean;
  actor?: string;
  onClose: () => void;
}) {
  const {
    verifyProfile,
    updateProfileStatus,
    setProfileRisk,
    saveAdminNotes,
    respondToAppeal,
    financeRecords,
  } = useStore();
  const stats = clipperStats(profile, clips, campaigns, financeRecords);
  const accs = accountsFor(profile, socialAccounts);
  const submissionsRef = useRef<HTMLDivElement>(null);

  // Reputation
  const repMetrics = calculateClipperReputation(clips, profile.id, campaigns, financeRecords, socialAccounts);
  const repScore = calculateReputationScore(repMetrics);

  const [riskOpen, setRiskOpen] = useState(false);
  const [riskFlag, setRiskFlag] = useState(!!profile.riskFlag);
  const [riskNote, setRiskNote] = useState(profile.riskNote ?? "");
  const [notes, setNotes] = useState(profile.adminNotes ?? "");
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const suspended = profile.status === "suspended";

  const onSuspend = () => {
    if (!suspendReason.trim()) {
      alert("Add a reason before suspending the account.");
      return;
    }
    updateProfileStatus(profile.id, "suspended", actor, suspendReason.trim());
    setShowSuspend(false);
    setSuspendReason("");
  };

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
              {profile.riskFlag && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red/10 px-2.5 py-0.5 text-[12px] font-medium text-red">
                  <AlertTriangle size={12} /> Risk
                </span>
              )}
            </div>
            <p className="mt-1 text-[14px] text-muted">
              @{profile.username} · {profile.email}
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
              disabled={!can("clipper.reactivate")}
              onClick={() => updateProfileStatus(profile.id, "active", actor)}
              primary
            />
          ) : (
            <ActionButton
              icon={<Ban size={14} />}
              label="Suspend"
              disabled={!can("clipper.suspend")}
              onClick={() => setShowSuspend(true)}
              danger
            />
          )}
          <ActionButton
            icon={profile.verified ? <BadgeX size={14} /> : <BadgeCheck size={14} />}
            label={profile.verified ? "Unverify" : "Verify"}
            disabled={!can("clipper.verify")}
            onClick={() => verifyProfile(profile.id, actor ?? "", !profile.verified)}
          />
          <ActionButton
            icon={<ShieldAlert size={14} />}
            label="Review risk"
            disabled={!can("clipper.review_risk")}
            onClick={() => setRiskOpen((v) => !v)}
          />
          <ActionButton
            icon={<FileText size={14} />}
            label="View submissions"
            onClick={() =>
              submissionsRef.current?.scrollIntoView({ behavior: "smooth" })
            }
          />
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
                placeholder="e.g. Confirmed view fraud"
                className="flex-1 rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
              />
              <button
                onClick={onSuspend}
                disabled={!can("clipper.suspend")}
                className="cursor-pointer rounded-[8px] bg-red px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Suspend
              </button>
            </div>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────── */}
        <div className="space-y-8 px-7 py-6">
          {/* Profile information */}
          <Section title="Profile information">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-[14px] sm:grid-cols-3">
              <Field label="Name" value={profile.name} />
              <Field label="Username" value={"@" + (profile.username ?? "—")} />
              <Field label="Email" value={profile.email} />
              <Field label="Role" value={profile.role} />
              <Field
                label="Status"
                value={suspended ? "Suspended" : "Active"}
              />
              <Field
                label="Verified"
                value={
                  profile.verified
                    ? "Yes" + (profile.verifiedAt ? ` · ${fmtDate(profile.verifiedAt)}` : "")
                    : "No"
                }
              />
              <Field label="Joined" value={fmtDate(profile.createdAt)} />
              <Field label="UPI" value={profile.upi ?? "—"} />
              {suspended && profile.suspendedReason && (
                <Field label="Suspension reason" value={profile.suspendedReason} />
              )}
            </div>
          </Section>

          {/* Social accounts */}
          <Section title="Social accounts">
            {accs.length === 0 ? (
              <p className="text-[14px] text-muted">No connected accounts.</p>
            ) : (
              <ul className="space-y-2">
                {accs.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                  >
                    <span className="flex items-center gap-2.5">
                      <PlatformIcon p={a.platform} size={15} />
                      <span className="font-medium">{a.handle}</span>
                      <span className="text-[13px] text-muted">{a.platform}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      {a.verified && (
                        <span className="inline-flex items-center gap-1 text-[13px] text-green">
                          <BadgeCheck size={12} /> Verified
                        </span>
                      )}
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${
                          a.status === "connected" || a.status === "verified"
                            ? "border-green/20 bg-green/10 text-green"
                            : a.status === "connecting"
                              ? "border-amber/20 bg-amber/10 text-amber"
                              : a.status === "connection_error"
                                ? "border-red/20 bg-red/10 text-red"
                                : "border-muted/20 bg-muted/10 text-muted"
                        }`}
                      >
                        {a.status.replace("_", " ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Performance */}
          <Section title="Performance">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricRow label="Total clips" value={String(stats.total)} />
                <MetricRow label="Approved" value={String(stats.approved)} />
                <MetricRow label="Rejected" value={String(stats.rejected)} />
                <MetricRow
                  label="Approval rate"
                  value={stats.approvalRate === null ? "—" : `${stats.approvalRate}%`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricRow label="Verified views" value={fmtViews(stats.verifiedViews)} />
                <MetricRow label="Total earned" value={rup(stats.earned)} />
                <MetricRow label="Total paid" value={rup(stats.paid)} />
                <MetricRow label="Outstanding" value={rup(stats.earned - stats.paid)} />
              </div>
            </div>
          </Section>

          {/* Reputation */}
          <Section title="Reputation">
            <div className="rounded-[8px] border border-border/40 bg-background px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium">Reputation score</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    Based on approval rate, campaign success, and payouts
                  </p>
                </div>
                <span
                  className={`font-mono text-[28px] font-bold ${
                    repScore >= 80
                      ? "text-green"
                      : repScore >= 50
                        ? "text-amber"
                        : "text-red"
                  }`}
                >
                  {repScore}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricRow label="Approved clips" value={String(repMetrics.totalApproved)} />
                <MetricRow label="Rejected clips" value={String(repMetrics.totalRejected)} />
                <MetricRow label="Campaigns" value={String(repMetrics.successfulCampaigns)} />
                <MetricRow label="Payouts completed" value={String(repMetrics.completedPayouts)} />
              </div>
            </div>
          </Section>

          {/* Submission history */}
          <div ref={submissionsRef} className="scroll-mt-4">
            <Section
              title="Submission history"
              action={
                <Link
                  href="/admin/clips"
                  className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-medium text-foreground hover:underline"
                >
                  Open review <ExternalLink size={12} />
                </Link>
              }
            >
              {stats.own.length === 0 ? (
                <p className="text-[14px] text-muted">No submissions yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                        <th className="px-3 py-2.5 font-medium">Campaign</th>
                        <th className="px-3 py-2.5 font-medium">Platform</th>
                        <th className="px-3 py-2.5 text-right font-medium">Views</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 text-right font-medium">Earnings</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {stats.own.map((k) => {
                        const camp = campaigns.find((c) => c.id === k.campaignId);
                        return (
                          <tr key={k.id}>
                            <td className="px-3 py-3">
                              <div className="font-medium">{camp?.title ?? k.campaignId}</div>
                              <div className="text-[13px] text-muted">{k.caption}</div>
                            </td>
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
          </div>

          {/* Earnings & payouts */}
          <Section title="Earnings & payouts">
            <p className="text-[14px] text-muted">
              Outstanding balance of <span className="font-medium text-foreground">{rup(stats.earned - stats.paid)}</span> is pending payout.
            </p>
            <div className="mt-3 space-y-2">
              {stats.own
                .filter((k) => k.status === "approved" || k.status === "held")
                .map((k) => {
                  const camp = campaigns.find((c) => c.id === k.campaignId);
                  return (
                    <div
                      key={k.id}
                      className="flex items-center justify-between rounded-[8px] border border-border/40 bg-background px-4 py-3 text-[14px]"
                    >
                      <span className="flex items-center gap-2.5">
                        <Wallet size={14} className="text-muted" />
                        <span className="font-medium">{camp?.title ?? k.campaignId}</span>
                        <StatusPill status={k.status} />
                      </span>
                      <span className="font-mono font-medium">{rup(clipEarnings(k, campaigns))}</span>
                    </div>
                  );
                })}
              {stats.own.filter((k) => k.status === "approved" || k.status === "held").length === 0 && (
                <p className="text-[14px] text-muted">No payouts yet.</p>
              )}
            </div>
          </Section>

          {/* Fraud / risk flags */}
          <Section title="Fraud / risk flags">
            <div className="flex items-center gap-2 text-[14px]">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                  profile.riskFlag
                    ? "bg-red/10 text-red"
                    : "bg-green/10 text-green"
                }`}
              >
                {profile.riskFlag ? (
                  <>
                    <ShieldAlert size={12} /> Flagged
                  </>
                ) : (
                  <>
                    <ShieldCheck size={12} /> No flags
                  </>
                )}
              </span>
            </div>
            {profile.riskNote && (
              <p className="mt-2 text-[14px] text-muted">{profile.riskNote}</p>
            )}
            {riskOpen && can("clipper.review_risk") && (
              <div className="mt-3 rounded-[8px] border border-border/40 bg-background p-4">
                <label className="flex items-center gap-2 text-[14px] font-medium">
                  <input
                    type="checkbox"
                    checked={riskFlag}
                    onChange={(e) => setRiskFlag(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Mark as risk flagged
                </label>
                <textarea
                  value={riskNote}
                  onChange={(e) => setRiskNote(e.target.value)}
                  rows={2}
                  placeholder="Risk note (why this account is flagged)"
                  className="mt-2 w-full rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
                />
                <button
                  onClick={() => {
                    setProfileRisk(profile.id, actor ?? "", riskFlag, riskNote.trim() || undefined);
                    setRiskOpen(false);
                  }}
                  className="mt-3 cursor-pointer rounded-[8px] bg-foreground px-4 py-2.5 text-[14px] font-medium text-background hover:opacity-90"
                >
                  Save risk decision
                </button>
              </div>
            )}
            {riskOpen && !can("clipper.review_risk") && (
              <p className="mt-2 text-[14px] text-muted">
                You don&apos;t have permission to review risk flags.
              </p>
            )}
          </Section>

          {/* Appeals */}
          <Section title="Appeals">
            {!profile.appeals || profile.appeals.length === 0 ? (
              <p className="text-[14px] text-muted">No appeals filed.</p>
            ) : (
              <div className="space-y-3">
                {profile.appeals.map((a) => (
                  <AppealRow
                    key={a.id}
                    appeal={a}
                    canRespond={can("clipper.appeals")}
                    onRespond={(response, status) =>
                      respondToAppeal(profile.id, a.id, response, status, actor ?? "")
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Admin notes */}
          <Section title="Admin notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes about this clipper"
              className="w-full rounded-[8px] border border-border/60 bg-background px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
            />
            <button
              disabled={!can("clipper.notes")}
              onClick={() => saveAdminNotes(profile.id, notes, actor ?? "")}
                  className="mt-2 cursor-pointer rounded-[8px] bg-foreground px-4 py-2.5 text-[14px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  Save notes
            </button>
            {!can("clipper.notes") && (
              <p className="mt-1 text-[13px] text-muted">
                You don&apos;t have permission to edit admin notes.
              </p>
            )}
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
                      <span className="text-muted"> · {fmtDateTime(e.at)}</span>
                      {e.note && (
                        <p className="mt-0.5 text-[13px] text-muted">
                          <ArrowUpRight size={11} className="mr-0.5 inline" />
                          {e.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function AppealRow({
  appeal,
  canRespond,
  onRespond,
}: {
  appeal: Appeal;
  canRespond: boolean;
  onRespond: (
    response: string,
    status: "reviewing" | "approved" | "rejected",
  ) => void;
}) {
  const [response, setResponse] = useState(appeal.response ?? "");
  return (
    <div className="rounded-[8px] border border-border/40 bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium">
          Appeal · {appeal.status}
        </span>
        {appeal.at && (
          <span className="text-[13px] text-muted">{fmtDate(appeal.at)}</span>
        )}
      </div>
      <p className="mt-1.5 text-[14px]">{appeal.reason}</p>
      {appeal.response && (
        <p className="mt-1.5 text-[14px] text-muted">Response: {appeal.response}</p>
      )}
      {canRespond && appeal.status !== "approved" && appeal.status !== "rejected" && (
        <div className="mt-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            rows={2}
            placeholder="Admin response"
            className="w-full rounded-[8px] border border-border/60 bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onRespond(response, "approved")}
              className="cursor-pointer rounded-[8px] bg-green px-3.5 py-2 text-[14px] font-medium text-white"
            >
              Approve
            </button>
            <button
              onClick={() => onRespond(response, "rejected")}
              className="cursor-pointer rounded-[8px] bg-red px-3.5 py-2 text-[14px] font-medium text-white hover:opacity-90"
            >
              Reject
            </button>
            <button
              onClick={() => onRespond(response, "reviewing")}
              className="cursor-pointer rounded-[8px] border border-border/60 px-3.5 py-2 text-[14px] font-medium"
            >
              Mark reviewing
            </button>
          </div>
        </div>
      )}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
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
