"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Wallet,
  ArrowDownToLine,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Link2,
  ShieldCheck,
  CalendarClock,
  Info,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, isEarned } from "@/lib/finance";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";

const UPI_ID = "maya.cuts@upi";
const MIN_WITHDRAWAL = 100;
const PAGE = 8;

function nextPayoutDate(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
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
  const { campaigns, clips, profiles, setClipStatus } = useStore();
  const { user } = useAuth();
  const myClips = clips.filter((k) => k.userId === user?.id || !k.userId);
  const fin = financeOf(myClips, campaigns);

  const available = fin.paid;
  const pendingEarnings = fin.outstanding;
  const processing = myClips
    .filter((k) => k.status === "processing")
    .reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const totalEarned = fin.earned;
  const totalPaid = fin.paid;

  const profile = profiles.find((p) => p.id === user?.id);
  const upi = profile?.upi || UPI_ID;
  const verified = !!profile?.upi;
  const canWithdraw = available >= MIN_WITHDRAWAL && !!profile?.upi;

  const [requested, setRequested] = useState(false);
  const [page, setPage] = useState(1);

  const txns = [...myClips].sort((a, b) => b.submittedAt - a.submittedAt);
  const visible = txns.slice(0, page * PAGE);
  const paidTxns = txns.filter((k) => k.status === "paid");

  const byCampaign = new Map<string, number>();
  for (const k of myClips) {
    byCampaign.set(
      k.campaignId,
      (byCampaign.get(k.campaignId) ?? 0) + clipEarnings(k, campaigns),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
        <p className="mt-1 text-sm text-muted">
          Your earnings, payouts, and payment details.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Available balance</p>
          <p className="mt-1 font-mono text-xl font-semibold text-green">
            {rup(available)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Ready to withdraw</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Pending earnings</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber">
            {rup(pendingEarnings)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Approved + in payout</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Processing</p>
          <p className="mt-1 font-mono text-xl font-semibold text-blue-500">
            {rup(processing)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Payout in flight</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Total earned</p>
          <p className="mt-1 font-mono text-xl font-semibold">{rup(totalEarned)}</p>
          <p className="mt-1 text-[11px] text-muted">All time</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted">Total paid</p>
          <p className="mt-1 font-mono text-xl font-semibold text-green">
            {rup(totalPaid)}
          </p>
          <p className="mt-1 text-[11px] text-muted">Released to you</p>
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
                  <th className="px-4 py-3 text-right font-medium">CPM</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted">
                      No transactions yet.
                    </td>
                  </tr>
                ) : (
                  visible.map((k) => {
                    const camp = campaigns.find((c) => c.id === k.campaignId);
                    const amount = clipEarnings(k, campaigns);
                    const earned = isEarned(k.status);
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
                            <PlatformIcon p={k.platform || camp?.platform || ""} size={14} />
                            <span className="line-clamp-1">{k.caption}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {fmtViews(k.views)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted">
                          {camp ? rup(camp.payout) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {earned ? (
                            <span className="text-green">{rup(amount)}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={k.status} />
                          {k.status === "failed" && k.failureReason && (
                            <div className="mt-2 max-w-[260px] rounded-md border border-red/30 bg-red/5 p-2 text-xs text-red">
                              <p className="font-medium">Payout failed</p>
                              <p className="mt-0.5 text-red/90">
                                {k.failureReason}
                              </p>
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() =>
                                    setClipStatus(k.id, "payable", {
                                      failureReason: undefined,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-accent-soft"
                                >
                                  <RefreshCw size={12} /> Retry payout
                                </button>
                                <Link
                                  href="/clipper/settings"
                                  className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white"
                                >
                                  <Link2 size={12} /> Update payment
                                </Link>
                              </div>
                            </div>
                          )}
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

            {requested ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-green/30 bg-accent-soft p-3 text-sm text-green">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <p>
                  Payout of <span className="font-mono">{rup(available)}</span>{" "}
                  requested. It will be released in the next payout cycle.
                </p>
              </div>
            ) : (
              <button
                type="button"
                disabled={!canWithdraw}
                onClick={() => setRequested(true)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowDownToLine size={16} />
                {available >= MIN_WITHDRAWAL
                  ? `Request payout · ${rup(available)}`
                  : `Needs ${rup(MIN_WITHDRAWAL)} to withdraw`}
              </button>
            )}
            {!canWithdraw && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Info size={12} />
                {!profile?.upi ? (
                  <Link href="/clipper/settings" className="text-accent hover:underline">
                    Add a verified payment method
                  </Link>
                ) : (
                  "Only released (paid) balance can be withdrawn — pending, held, or disputed earnings are not payable."
                )}
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Payout history</h3>
            <div className="mt-3 divide-y">
              {paidTxns.length === 0 ? (
                <p className="py-4 text-sm text-muted">No payouts yet.</p>
              ) : (
                paidTxns.map((k) => {
                  const camp = campaigns.find((c) => c.id === k.campaignId);
                  return (
                    <div
                      key={k.id}
                      className="flex items-center justify-between py-3 text-sm"
                    >
                      <div>
                        <Link
                          href={`/clip/${k.id}`}
                          className="font-medium hover:text-accent"
                        >
                          {camp?.title ?? k.campaignId}
                        </Link>
                        <p className="text-xs text-muted">
                          {fmtDate(k.submittedAt)} · Paid
                        </p>
                      </div>
                      <span className="font-mono font-medium text-green">
                        +{rup(clipEarnings(k, campaigns))}
                      </span>
                    </div>
                  );
                })
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
                  <span className="font-mono">{rup(amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
