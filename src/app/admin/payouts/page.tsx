"use client";

import { useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ArrowRight,
  Search,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup } from "@/lib/format";
import type { PayoutRequest, PayoutRequestStatus } from "@/lib/types";

const STATUS_STYLES: Record<PayoutRequestStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  paid: "bg-green-100 text-green-800 border-green-200",
};

function PayoutStatusBadge({ status }: { status: PayoutRequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function fmtDate(t?: number) {
  if (!t) return "\u2014";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Manage clipper payout requests. Send UPI payments manually, then record the transaction reference.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm font-medium">
        {(["all", "pending", "processing", "paid"] as const).map((tab) => {
          const count = tab === "all" ? counts.all : counts[tab];
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                activeTab === tab
                  ? "bg-accent text-white"
                  : "bg-muted/50 text-muted hover:bg-muted"
              }`}
            >
              {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by UPI ID, username, or UTR..."
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Clipper</th>
              <th className="px-4 py-3">UPI ID</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Net (after fees)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">UTR / Reference</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted">
                  No payout requests found.
                </td>
              </tr>
            )}
            {filtered.map((payout) => {
              const profile = profiles.find((p) => p.id === payout.userId);
              const isProcessing = processingId === payout.id;
              const isCompleting = completingId === payout.id;

              return (
                <tr key={payout.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-foreground">{profile?.name ?? profile?.username ?? "Unknown"}</p>
                      <p className="text-xs text-muted">@{profile?.username ?? "unknown"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{payout.upiId}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{rup(payout.amount / 100)}</td>
                  <td className="px-4 py-3 text-right text-muted">{rup(payout.netAmount / 100)}</td>
                  <td className="px-4 py-3">
                    <PayoutStatusBadge status={payout.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{fmtDate(payout.createdAt)}</td>
                  <td className="px-4 py-3">
                    {payout.paymentReference ? (
                      <span className="font-mono text-xs text-foreground">{payout.paymentReference}</span>
                    ) : (
                      <span className="text-xs text-muted">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {payout.status === "pending" && (
                      <button
                        onClick={() => handleProcess(payout)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ArrowRight size={14} />
                        )}
                        Start Processing
                      </button>
                    )}
                    {payout.status === "processing" && (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            value={completingId === payout.id ? utrInput : ""}
                            onChange={(e) => {
                              setCompletingId(payout.id);
                              setUtrInput(e.target.value);
                            }}
                            onFocus={() => setCompletingId(payout.id)}
                            placeholder="Enter UPI UTR"
                            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                          <button
                            onClick={() => handleComplete(payout)}
                            disabled={isCompleting || !utrInput.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                          >
                            {isCompleting ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={14} />
                            )}
                            Mark Paid
                          </button>
                        </div>
                        <p className="text-[10px] text-muted">
                          Send UPI payment to {payout.upiId} first, then record the UTR here.
                        </p>
                      </div>
                    )}
                    {payout.status === "paid" && (
                      <div className="text-right">
                        <p className="text-xs text-muted">Paid {fmtDate(payout.paidAt)}</p>
                        {payout.paidBy && (
                          <p className="text-[10px] text-muted">by {payout.paidBy}</p>
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

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Banknote size={20} className="mt-0.5 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Manual UPI Payout Process</h3>
            <ol className="mt-2 space-y-1 text-xs text-muted list-decimal list-inside">
              <li>Clipper requests payout when balance reaches minimum threshold.</li>
              <li>Admin reviews the request and clicks <strong>&quot;Start Processing&quot;</strong>.</li>
              <li>Admin manually sends UPI payment to the clipper&apos;s UPI ID.</li>
              <li>Admin records the UPI Transaction Reference (UTR) and clicks <strong>&quot;Mark Paid&quot;</strong>.</li>
              <li>Payout is marked as paid. No automated payment gateway is used.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
