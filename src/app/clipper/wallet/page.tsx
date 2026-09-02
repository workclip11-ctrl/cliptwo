"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wallet,
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
  const available = fin.paid;
  const pendingEarnings = fin.pending;
  const processing = fin.processing;
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
      const res = await fetch("/api/payout/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Your earnings, payouts, and payment details.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Available balance</p>
          <p className="mt-1 font-mono text-xl font-semibold text-green">
            {rup(available / 100)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Ready to withdraw</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Pending earnings</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber">
            {rup(pendingEarnings / 100)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Awaiting admin review</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Processing</p>
          <p className="mt-1 font-mono text-xl font-semibold text-blue-500">
            {rup(processing / 100)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Payout in flight</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Total earned</p>
          <p className="mt-1 font-mono text-xl font-semibold">{rup(totalEarned / 100)}</p>
          <p className="mt-1 text-[11px] text-muted">All time</p>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Transaction history
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Clip</th>
                  <th className="px-4 py-3 text-right font-medium">Views</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  visible.map((k) => {
                    const camp = campaigns.find((c) => c.id === k.campaignId);
                    const record = myFinanceRecords.find((r) => r.clipId === k.id);
                    return (
                      <tr key={k.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-muted">
                          {fmtDate(k.submittedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/campaigns/${k.campaignId}`}
                            className="font-medium hover:text-accent"
                          >
                            {camp?.title ?? k.campaignId}
                          </Link>
                        </td>
                        <td className="max-w-[220px] px-4 py-3">
                          <Link
                            href={`/clip/${k.id}`}
                            className="inline-flex items-center gap-1.5 hover:text-accent"
                          >
                            <PlatformIcon p={k.platform || camp?.platform || "Instagram"} size={14} />
                            <span className="line-clamp-1">{k.caption}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmtViews(k.verifiedViews ?? k.views)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {record ? (
                            <span className="text-green">{rup(record.netAmount / 100)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
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
            <div className="border-t px-4 py-3 text-center">
              <button
                onClick={() => setPage((p) => p + 1)}
                className="text-xs font-medium text-accent hover:underline"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </section>

      {/* UPI details */}
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Payment details
        </h2>
        <p className="mt-1 text-sm text-muted">
          Enter your UPI ID to receive payouts directly to your bank account.
        </p>

        <div className="mt-4 rounded-xl border border-dashed p-4">
          <label className="block text-sm">
            <span className="text-muted">UPI ID</span>
            <div className="mt-1.5 flex items-center gap-2">
              {editingUpi ? (
                <>
                  <input
                    value={upiInput}
                    onChange={(e) => setUpiInput(e.target.value)}
                    placeholder="yourname@upi"
                    autoFocus
                    className="flex-1 rounded-lg border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-foreground sm:max-w-xs"
                  />
                  <button
                    onClick={() => {
                      if (upiInput.trim()) {
                        updateProfile(user!.id, { upi: upiInput.trim() });
                        setEditingUpi(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    <Save size={14} /> Save
                  </button>
                  <button
                    onClick={() => { setEditingUpi(false); setUpiInput(profile?.upi ?? ""); }}
                    className="rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-accent-soft"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-mono text-sm">
                    {profile?.upi ? profile.upi : <span className="text-muted italic">Not set</span>}
                  </span>
                  <button
                    onClick={() => setEditingUpi(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
                  >
                    <Pencil size={13} /> {profile?.upi ? "Change" : "Add UPI"}
                  </button>
                </>
              )}
            </div>
          </label>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck size={12} className="text-green" />
            Your UPI ID is verified by our team before payouts are enabled.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Payouts
        </h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">Current payment method</p>
                <p className="mt-1 flex items-center gap-2 font-mono text-sm font-medium">
                  <Wallet size={14} className="text-muted" /> {upi}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  verified
                    ? "border-green/30 bg-accent-soft text-green"
                    : "border-amber/30 bg-amber/10 text-amber"
                }`}
              >
                {verified ? (
                  <>
                    <ShieldCheck size={13} /> Verified
                  </>
                ) : (
                  <>
                    <AlertTriangle size={13} /> Unverified
                  </>
                )}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">Minimum withdrawal</p>
                <p className="mt-1 font-mono font-medium">{rup(MIN_WITHDRAWAL)}</p>
              </div>
              <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-muted">Payout schedule</p>
                <p className="mt-1 flex items-center gap-1.5 font-medium">
                  <CalendarClock size={13} className="text-muted" /> Weekly
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Next: {nextPayoutDate()}
                </p>
              </div>
            </div>

            {requestSuccess && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-green/30 bg-accent-soft p-3 text-sm text-green">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <p>{requestSuccess}</p>
              </div>
            )}
            {requestError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red/30 bg-red/5 p-3 text-sm text-red">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{requestError}</p>
              </div>
            )}

            {!requestSuccess && (
              <button
                type="button"
                disabled={!canWithdraw || requesting || hasInProgress}
                onClick={handleRequestPayout}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
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
            {!canWithdraw && !hasInProgress && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Info size={12} />
                {!profile?.upi ? (
                  <span className="text-accent">
                    Add your UPI ID above to enable payouts
                  </span>
                ) : (
                  "Only released (paid) balance can be withdrawn — pending or processing earnings are not yet payable."
                )}
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Payout history</h3>
            <div className="mt-3 divide-y">
              {myPayouts.length === 0 ? (
                <p className="py-4 text-sm text-muted">No payouts yet.</p>
              ) : (
                myPayouts.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {rup(p.netAmount / 100)}
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDate(p.createdAt)}
                        {p.paidAt && " · Paid"}
                        {p.status === "processing" && " · Processing"}
                      </p>
                      {p.paymentReference && (
                        <p className="mt-0.5 text-[11px] text-muted font-mono">
                          Ref: {p.paymentReference}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        p.status === "paid"
                          ? "bg-green/10 text-green"
                          : p.status === "processing"
                            ? "bg-blue-500/10 text-blue-500"
                            : "bg-muted/10 text-muted"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {byCampaign.size > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
            Earnings by campaign
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border bg-card">
            <ul className="divide-y">
              {[...byCampaign.entries()].map(([id, amount]) => (
                <li
                  key={id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <Link
                    href={`/campaigns/${id}`}
                    className="font-medium hover:text-accent"
                  >
                    {campaigns.find((c) => c.id === id)?.title ?? id}
                  </Link>
                  <span className="font-mono">{rup(amount / 100)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
