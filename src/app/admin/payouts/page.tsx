"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ArrowRight,
  Search,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup } from "@/lib/format";
import type { PayoutRequest, PayoutRequestStatus } from "@/lib/types";

const STATUS_STYLES: Record<PayoutRequestStatus, string> = {
  pending: "bg-amber/10 text-amber",
  processing: "bg-amber/10 text-amber",
  paid: "bg-green/10 text-green",
};

function PayoutStatusBadge({ status }: { status: PayoutRequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_STYLES[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function fmtDate(t?: number) {
  if (!t) return "—";
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminPayoutsPage() {
  const { payoutRequests, profiles, processPayoutRequest, completePayoutRequest } = useStore();
  const { user } = useAuth();
  useAutoRefresh();

  const [activeTab, setActiveTab] = useState<"all" | PayoutRequestStatus>("all");
  const [q, setQ] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [utrInput, setUtrInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const actor = user?.email ?? user?.name ?? "Admin";

  const filtered = useMemo(() => {
    let list = [...payoutRequests];
    if (activeTab !== "all") {
      list = list.filter((p) => p.status === activeTab);
    }
    if (q.trim()) {
      const lq = q.toLowerCase();
      list = list.filter((p) => {
        const profile = profiles.find((pr) => pr.id === p.userId);
        return (
          p.upiId.toLowerCase().includes(lq) ||
          (profile?.username ?? "").toLowerCase().includes(lq) ||
          (profile?.name ?? "").toLowerCase().includes(lq) ||
          (p.paymentReference ?? "").toLowerCase().includes(lq)
        );
      });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [payoutRequests, profiles, activeTab, q]);

  const counts = useMemo(() => ({
    all: payoutRequests.length,
    pending: payoutRequests.filter((p) => p.status === "pending").length,
    processing: payoutRequests.filter((p) => p.status === "processing").length,
    paid: payoutRequests.filter((p) => p.status === "paid").length,
  }), [payoutRequests]);

  const handleProcess = async (payout: PayoutRequest) => {
    setProcessingId(payout.id);
    setError(null);
    try {
      await processPayoutRequest(payout.id, actor);
    } catch {
      setError("Failed to process payout. Check console for details.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleComplete = async (payout: PayoutRequest) => {
    if (!utrInput.trim()) {
      setError("UPI Transaction Reference (UTR) is required. Record the actual UPI transfer before confirming.");
      return;
    }
    setCompletingId(payout.id);
    setError(null);
    try {
      await completePayoutRequest(payout.id, utrInput.trim(), actor);
      setUtrInput("");
    } catch {
      setError("Failed to complete payout. Check console for details.");
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Payouts
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted">
          Manage clipper payout requests and record completed UPI transfers.
        </p>
      </div>

      {/* ── Summary metrics ─────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.all}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Total requests</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.pending}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Pending</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.processing}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Processing</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.paid}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Paid</p>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-red/20 bg-red/5 px-5 py-3.5">
          <AlertTriangle size={16} className="shrink-0 text-red" />
          <p className="flex-1 text-[14px] text-red">{error}</p>
          <button
            onClick={() => setError(null)}
            className="shrink-0 cursor-pointer text-red/60 transition-colors hover:text-red"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Tabs + search toolbar ───────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "pending", "processing", "paid"] as const).map((tab) => {
            const count = tab === "all" ? counts.all : counts[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`cursor-pointer rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                  activeTab === tab
                    ? "bg-foreground text-background"
                    : "border border-border/50 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
                }`}
              >
                {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                <span className="ml-1.5 text-[12px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by UPI ID, username, or UTR…"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
          />
        </div>
      </div>

      {/* ── Mobile cards ─────────────────────────────────── */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((payout) => {
          const profile = profiles.find((p) => p.id === payout.userId);
          const isProcessing = processingId === payout.id;
          const isCompleting = completingId === payout.id;
          return (
            <div key={payout.id} className="rounded-[12px] border border-border/40 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium">{profile?.name ?? profile?.username ?? "Unknown"}</p>
                  <p className="mt-0.5 text-[13px] text-muted">@{profile?.username ?? "unknown"} · {payout.upiId}</p>
                </div>
                <PayoutStatusBadge status={payout.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div><span className="text-muted">Amount </span><span className="font-mono font-medium">{rup(payout.amount / 100)}</span></div>
                <div><span className="text-muted">Net </span><span className="font-mono font-medium">{rup(payout.netAmount / 100)}</span></div>
                <div><span className="text-muted">Requested </span><span className="font-mono">{fmtDate(payout.createdAt)}</span></div>
                <div><span className="text-muted">UTR </span><span className="font-mono">{payout.paymentReference || "—"}</span></div>
              </div>
              {payout.status === "pending" && (
                <div className="mt-3">
                  <button
                    onClick={() => handleProcess(payout)}
                    disabled={isProcessing}
                    className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[8px] bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={13} />}
                    Start Processing
                  </button>
                </div>
              )}
              {payout.status === "processing" && (
                <div className="mt-3 space-y-2">
                  <input
                    value={completingId === payout.id ? utrInput : ""}
                    onChange={(e) => { setCompletingId(payout.id); setUtrInput(e.target.value); }}
                    onFocus={() => setCompletingId(payout.id)}
                    placeholder="Enter UPI UTR"
                    className="h-10 w-full rounded-[8px] border border-border/60 bg-background px-3.5 font-mono text-[14px] outline-none transition-colors focus:border-foreground/30"
                  />
                  <button
                    onClick={() => handleComplete(payout)}
                    disabled={isCompleting || !utrInput.trim()}
                    className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[8px] bg-green px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isCompleting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Mark Paid
                  </button>
                  <p className="text-[12px] text-muted">Send UPI payment to {payout.upiId} first, then record the UTR.</p>
                </div>
              )}
              {payout.status === "paid" && (
                <p className="mt-2 text-[13px] text-muted">Paid {fmtDate(payout.paidAt)}{payout.paidBy ? ` by ${payout.paidBy}` : ""}</p>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-[12px] border border-border/40 bg-card p-8 text-center">
            <p className="text-[15px] font-medium">No payout requests found</p>
            <p className="mt-1 text-[13px] text-muted">Payout requests will appear here when clippers submit withdrawal requests.</p>
          </div>
        )}
      </div>

      {/* ── Desktop table ────────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-xl border border-border/40 bg-card sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-[14px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                <th className="px-5 py-3 font-medium">Clipper</th>
                <th className="px-5 py-3 font-medium">UPI ID</th>
                <th className="px-5 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 text-right font-medium">Net</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Requested</th>
                <th className="px-5 py-3 font-medium">UTR / Reference</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12">
                    <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
                      <p className="text-[15px] font-medium text-foreground">No payout requests found</p>
                      <p className="mt-1 text-[13px] text-muted">
                        Payout requests will appear here when clippers submit withdrawal requests.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((payout) => {
                const profile = profiles.find((p) => p.id === payout.userId);
                const isProcessing = processingId === payout.id;
                const isCompleting = completingId === payout.id;

                return (
                  <tr key={payout.id} className="transition-colors hover:bg-accent-soft/50">
                    {/* Clipper */}
                    <td className="px-5 py-4">
                      <p className="font-medium">{profile?.name ?? profile?.username ?? "Unknown"}</p>
                      <p className="text-[13px] text-muted">@{profile?.username ?? "unknown"}</p>
                    </td>

                    {/* UPI ID */}
                    <td className="px-5 py-4 font-mono text-[13px]">{payout.upiId}</td>

                    {/* Amount */}
                    <td className="px-5 py-4 text-right font-mono text-[16px] font-semibold">
                      {rup(payout.amount / 100)}
                    </td>

                    {/* Net */}
                    <td className="px-5 py-4 text-right font-mono text-[16px] font-semibold">
                      {rup(payout.netAmount / 100)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <PayoutStatusBadge status={payout.status} />
                    </td>

                    {/* Requested */}
                    <td className="px-5 py-4 text-[13px] text-muted">
                      {fmtDate(payout.createdAt)}
                    </td>

                    {/* UTR / Reference */}
                    <td className="px-5 py-4">
                      {payout.paymentReference ? (
                        <span className="font-mono text-[13px]">{payout.paymentReference}</span>
                      ) : (
                        <span className="text-[13px] text-muted">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      {payout.status === "pending" && (
                        <button
                          onClick={() => handleProcess(payout)}
                          disabled={isProcessing}
                          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] bg-foreground px-4 text-[14px] font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <ArrowRight size={14} />
                          )}
                          Start Processing
                        </button>
                      )}
                      {payout.status === "processing" && (
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={completingId === payout.id ? utrInput : ""}
                              onChange={(e) => {
                                setCompletingId(payout.id);
                                setUtrInput(e.target.value);
                              }}
                              onFocus={() => setCompletingId(payout.id)}
                              placeholder="Enter UPI UTR"
                              className="h-10 w-[180px] rounded-[8px] border border-border/60 bg-background px-3.5 font-mono text-[14px] outline-none transition-colors focus:border-foreground/30"
                            />
                            <button
                              onClick={() => handleComplete(payout)}
                              disabled={isCompleting || !utrInput.trim()}
                              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[8px] bg-green px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isCompleting ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <CheckCircle2 size={14} />
                              )}
                              Mark Paid
                            </button>
                          </div>
                          <p className="text-[12px] text-muted">
                            Send UPI payment to {payout.upiId} first, then record the UTR here.
                          </p>
                        </div>
                      )}
                      {payout.status === "paid" && (
                        <div className="text-right">
                          <p className="text-[13px] text-muted">Paid {fmtDate(payout.paidAt)}</p>
                          {payout.paidBy && (
                            <p className="text-[12px] text-muted">by {payout.paidBy}</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Manual UPI payout process ───────────────────── */}
      <div className="border-t border-border/40 pt-6">
        <div className="flex items-start gap-3">
          <Banknote size={18} className="mt-0.5 shrink-0 text-muted" />
          <div>
            <h3 className="text-[15px] font-semibold">Manual UPI Payout Process</h3>
            <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted list-decimal list-inside">
              <li>Clipper requests payout when balance reaches minimum threshold.</li>
              <li>Admin reviews the request and clicks <span className="font-medium text-foreground">&quot;Start Processing&quot;</span>.</li>
              <li>Admin manually sends UPI payment to the clipper&apos;s UPI ID.</li>
              <li>Admin records the UPI Transaction Reference (UTR) and clicks <span className="font-medium text-foreground">&quot;Mark Paid&quot;</span>.</li>
              <li>Payout is marked as paid. No automated payment gateway is used.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
