"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  CalendarClock,
  Info,
  Pencil,
  Save,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews } from "@/lib/format";
import { financeOf } from "@/lib/finance";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const MIN_WITHDRAWAL = 100;
const PAGE = 8;

function nextPayoutDate(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMon = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClipperWalletPage() {
  const { campaigns, clips, profiles, financeRecords, payoutRequests, updateProfile } = useStore();
  const { user } = useAuth();
  const myClips = clips.filter((k) => k.userId && k.userId === user?.id);
  const myFinanceRecords = financeRecords.filter((r) => r.clipperId === user?.id);
  const myPayouts = payoutRequests.filter((p) => p.userId === user?.id);

  const fin = financeOf(myFinanceRecords);
  const available = fin.processing;
  const pendingEarnings = fin.pending;
  const paidOut = fin.paid;
  const totalEarned = fin.total;

  const profile = profiles.find((p) => p.id === user?.id);
  const upi = profile?.upi || "";
  const verified = !!profile?.upi;
  const canWithdraw = available >= MIN_WITHDRAWAL * 100 && !!profile?.upi;

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editingUpi, setEditingUpi] = useState(false);
  const [upiInput, setUpiInput] = useState(profile?.upi ?? "");

  const handleRequestPayout = async () => {
    if (!canWithdraw || requesting) return;
    setRequesting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }

      const res = await fetch("/api/payout/request", {
        method: "POST",
        headers,
      });

      const body = await res.json();

      if (!res.ok) {
        setRequestError(body.error ?? "Payout request failed");
        return;
      }

      setRequestSuccess(
        `Payout of ${rup(available / 100)} requested. It will be processed shortly.`,
      );
    } catch {
      setRequestError("Network error. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  const txns = [...myClips].sort((a, b) => b.submittedAt - a.submittedAt);
  const visible = txns.slice(0, page * PAGE);

  const byCampaign = new Map<string, number>();
  for (const r of myFinanceRecords) {
    const existing = byCampaign.get(r.campaignId) ?? 0;
    byCampaign.set(r.campaignId, existing + r.netAmount);
  }

  const hasInProgress = myPayouts.some(
    (p) => p.status === "pending" || p.status === "processing",
  );

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-8 sm:space-y-14 sm:px-8 sm:py-10">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Wallet
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Your earnings, payouts, and payment details.
        </p>
      </div>

      {/* ── Earnings overview ───────────────────────────── */}
      <section>
        <p className="mb-2 text-[13px] font-medium text-muted">
          Available balance
        </p>
        <p className="font-mono text-[36px] font-bold tracking-tight leading-none text-green">
          {rup(available / 100)}
        </p>
        <p className="mt-2 text-[14px] text-muted">Ready to withdraw</p>

        <div className="mt-6 flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[14px]">
          <span>
            <span className="text-muted">Pending </span>
            <span className="font-medium text-amber">
              {rup(pendingEarnings / 100)}
            </span>
          </span>
          <span>
            <span className="text-muted">Paid out </span>
            <span className="font-medium">{rup(paidOut / 100)}</span>
          </span>
          <span>
            <span className="text-muted">Total earned </span>
            <span className="font-medium">{rup(totalEarned / 100)}</span>
          </span>
        </div>
      </section>

      {/* ── Request payout ──────────────────────────────── */}
      <section>
        <div className="rounded-[12px] border border-border/40 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {/* Left: info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[14px]">
                <span className="text-muted">Payment method</span>
                <span className="font-mono font-medium">{upi || "Not set"}</span>
                {verified ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-green">
                    <ShieldCheck size={13} /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber">
                    <AlertTriangle size={13} /> Unverified
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                <span>
                  Min withdrawal <span className="font-medium text-foreground">{rup(MIN_WITHDRAWAL)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <CalendarClock size={13} /> Weekly · Next: {nextPayoutDate()}
                </span>
              </div>
            </div>

            {/* Right: CTA */}
            <div className="shrink-0">
              {!requestSuccess && (
                <button
                  type="button"
                  disabled={!canWithdraw || requesting || hasInProgress}
                  onClick={handleRequestPayout}
                  className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-accent px-6 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {requesting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Processing...
                    </>
                  ) : hasInProgress ? (
                    "Payout in progress"
                  ) : (
                    <>
                      <ArrowDownToLine size={16} />
                      {available >= MIN_WITHDRAWAL * 100
                        ? `Request payout · ${rup(available / 100)}`
                        : `Needs ${rup(MIN_WITHDRAWAL)} to withdraw`}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Status messages */}
          {requestSuccess && (
            <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-green/30 bg-green/5 px-4 py-3 text-[14px] text-green">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <p>{requestSuccess}</p>
            </div>
          )}
          {requestError && (
            <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-red/30 bg-red/5 px-4 py-3 text-[14px] text-red">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>{requestError}</p>
            </div>
          )}
          {!canWithdraw && !hasInProgress && !requestSuccess && (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
              <Info size={13} />
              {!profile?.upi ? (
                <span>Add your UPI ID in payment details below to enable payouts.</span>
              ) : (
                "Only finalized (processing) balance can be withdrawn."
              )}
            </p>
          )}
        </div>
      </section>

      {/* ── Transaction history ─────────────────────────── */}
      <section>
        <h2 className="mb-5 text-[18px] font-bold tracking-tight">
          Transaction history
        </h2>
        {/* Mobile: card-based list */}
        <div className="block sm:hidden">
          <div className="space-y-3">
            {visible.length === 0 ? (
              <div className="rounded-[12px] border border-dashed bg-card p-8 text-center">
                <p className="text-[15px] font-medium text-foreground">No transactions yet</p>
                <p className="mt-1 text-[13px] text-muted">
                  Your clip submissions and earnings will appear here.
                </p>
              </div>
            ) : (
              visible.map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                const record = myFinanceRecords.find((r) => r.clipId === k.id);
                return (
                  <div key={k.id} className="rounded-[12px] border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/campaigns/${k.campaignId}`}
                          className="text-[14px] font-medium hover:underline underline-offset-2"
                        >
                          {camp?.title ?? k.campaignId}
                        </Link>
                        <p className="mt-0.5 truncate text-[13px] text-muted">
                          <span className="inline-flex items-center gap-1">
                            <PlatformIcon p={k.platform || camp?.platform || "Instagram"} size={12} />
                            {k.caption}
                          </span>
                        </p>
                      </div>
                      <StatusPill status={k.status} />
                    </div>
                    <div className="mt-2.5 flex items-center justify-between text-[13px]">
                      <span className="text-muted">{fmtDate(k.submittedAt)}</span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-muted">{fmtViews(k.verifiedViews ?? k.views)} views</span>
                        <span className="font-mono font-semibold">
                          {record ? (
                            <span className="text-green">{rup(record.netAmount / 100)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {txns.length > visible.length && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="mt-3 flex w-full items-center justify-center rounded-[12px] border bg-card py-3 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft"
            >
              Load more
            </button>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block">
          <div className="overflow-hidden rounded-[12px] border border-border/40 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[14px]">
                <thead>
                  <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Campaign</th>
                    <th className="px-5 py-3 font-medium">Clip</th>
                    <th className="px-5 py-3 text-right font-medium">Views</th>
                    <th className="px-5 py-3 text-right font-medium">Amount</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12">
                        <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                          <p className="text-[15px] font-medium text-foreground">No transactions yet</p>
                          <p className="mt-1 text-[13px] text-muted">
                            Your clip submissions and earnings will appear here.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    visible.map((k) => {
                      const camp = campaigns.find((c) => c.id === k.campaignId);
                      const record = myFinanceRecords.find((r) => r.clipId === k.id);
                      return (
                        <tr key={k.id} className="align-top transition-colors hover:bg-accent-soft/30">
                          <td className="whitespace-nowrap px-5 py-3.5 text-muted">
                            {fmtDate(k.submittedAt)}
                          </td>
                          <td className="px-5 py-3.5">
                            <Link
                              href={`/campaigns/${k.campaignId}`}
                              className="cursor-pointer font-medium hover:underline underline-offset-2"
                            >
                              {camp?.title ?? k.campaignId}
                            </Link>
                          </td>
                          <td className="max-w-[220px] px-5 py-3.5">
                            <Link
                              href={`/clip/${k.id}`}
                              className="cursor-pointer inline-flex items-center gap-1.5 hover:underline underline-offset-2"
                            >
                              <PlatformIcon p={k.platform || camp?.platform || "Instagram"} size={14} />
                              <span className="line-clamp-1">{k.caption}</span>
                            </Link>
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                            {fmtViews(k.verifiedViews ?? k.views)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono tabular-nums font-semibold">
                            {record ? (
                              <span className="text-green">{rup(record.netAmount / 100)}</span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <StatusPill status={k.status} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {txns.length > visible.length && (
              <div className="border-t border-border/40 px-5 py-3 text-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="cursor-pointer text-[13px] font-medium text-accent hover:underline"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Payment details ─────────────────────────────── */}
      <section>
        <h2 className="mb-1.5 text-[18px] font-bold tracking-tight">
          Payment details
        </h2>
        <p className="mb-5 text-[14px] text-muted">
          Your UPI ID for receiving payouts.
        </p>

        <div className="rounded-[12px] border border-border/40 bg-card p-5 sm:p-6">
          <label className="block text-[14px]">
            <span className="mb-1.5 block text-muted">UPI ID</span>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2.5">
              {editingUpi ? (
                <>
                  <input
                    value={upiInput}
                    onChange={(e) => setUpiInput(e.target.value)}
                    placeholder="yourname@upi"
                    autoFocus
                    className="h-11 flex-1 rounded-[10px] border border-border/60 bg-background px-3.5 font-mono text-[14px] outline-none transition-colors focus:border-foreground/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (upiInput.trim()) {
                          updateProfile(user!.id, { upi: upiInput.trim() });
                          setEditingUpi(false);
                        }
                      }}
                      className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-accent px-4 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-foreground/90 sm:flex-initial"
                    >
                      <Save size={14} /> Save
                    </button>
                    <button
                      onClick={() => { setEditingUpi(false); setUpiInput(profile?.upi ?? ""); }}
                      className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] border border-border/60 px-4 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground sm:flex-initial"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex-1 font-mono text-[14px]">
                    {profile?.upi ? profile.upi : <span className="text-muted italic">Not set</span>}
                  </span>
                  <button
                    onClick={() => setEditingUpi(true)}
                    className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border/60 px-4 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-foreground"
                  >
                    <Pencil size={13} /> {profile?.upi ? "Change" : "Add UPI"}
                  </button>
                </>
              )}
            </div>
          </label>
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
            <ShieldCheck size={13} className="text-green" />
            Your UPI ID is verified by our team before payouts are enabled.
          </p>
        </div>
      </section>

      {/* ── Payout history ──────────────────────────────── */}
      {myPayouts.length > 0 && (
        <section>
          <h2 className="mb-5 text-[18px] font-bold tracking-tight">
            Payout history
          </h2>
          <div className="divide-y divide-border/40 rounded-[12px] border border-border/40 bg-card">
            {myPayouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="font-mono text-[15px] font-semibold">
                    {rup(p.netAmount / 100)}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {fmtDate(p.createdAt)}
                    {p.paidAt && " · Paid"}
                    {p.status === "processing" && " · Processing"}
                  </p>
                  {p.paymentReference && (
                    <p className="mt-0.5 font-mono text-[12px] text-muted">
                      Ref: {p.paymentReference}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium ${
                    p.status === "paid"
                      ? "bg-green/10 text-green"
                      : p.status === "processing"
                        ? "bg-blue-500/10 text-blue-500"
                        : "bg-accent-soft text-muted"
                  }`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Earnings by campaign ────────────────────────── */}
      {byCampaign.size > 0 && (
        <section>
          <h2 className="mb-5 text-[18px] font-bold tracking-tight">
            Earnings by campaign
          </h2>
          <div className="divide-y divide-border/40 rounded-[12px] border border-border/40 bg-card">
            {[...byCampaign.entries()].map(([id, amount]) => (
              <div
                key={id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <Link
                  href={`/campaigns/${id}`}
                  className="cursor-pointer font-medium hover:underline underline-offset-2"
                >
                  {campaigns.find((c) => c.id === id)?.title ?? id}
                </Link>
                <span className="font-mono tabular-nums">{rup(amount / 100)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
