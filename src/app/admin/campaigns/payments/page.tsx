"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { rup } from "@/lib/format";
import { useAuth } from "@/lib/auth";

interface CampaignPayment {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_budget_rupees: number;
  platform_fee_paise: number;
  total_payable_paise: number;
  payment_status: string;
  utr_reference: string;
  rejection_reason: string;
  submitted_at: string;
  verified_at: string;
  rejected_at: string;
  creator_name: string;
  creator_id: string;
  campaign_status: string;
}

type FilterStatus = "all" | "submitted" | "verified" | "rejected";

export default function AdminCampaignPayments() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<CampaignPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>("submitted");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const statusParam = filter === "all" ? "" : filter;
      const res = await fetch(
        `/api/campaigns/payment/list${statusParam ? `?status=${statusParam}` : ""}`,
      );
      const data = await res.json();
      if (res.ok) {
        setPayments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch payments:", err);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  // Fetch on mount and when filter changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      setLoading(true);
      try {
        const statusParam = filter === "all" ? "" : filter;
        const res = await fetch(
          `/api/campaigns/payment/list${statusParam ? `?status=${statusParam}` : ""}`,
        );
        const data = await res.json();
        if (!cancelled && res.ok) {
          setPayments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to fetch payments:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user, filter]);

  async function handleVerify(paymentId: string) {
    if (actionLoading) return;
    if (!confirm("Verify this payment and publish the campaign?")) return;

    setActionLoading(paymentId);
    try {
      const res = await fetch("/api/campaigns/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchPayments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(paymentId: string) {
    if (actionLoading) return;

    setActionLoading(paymentId);
    try {
      const res = await fetch("/api/campaigns/payment/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, reason: rejectReason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRejectModal(null);
      setRejectReason("");
      await fetchPayments();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = payments.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        p.campaign_title?.toLowerCase().includes(q) ||
        p.creator_name?.toLowerCase().includes(q) ||
        p.utr_reference?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Campaign Payments
        </h1>
        <p className="mt-1 text-sm text-muted">
          Verify creator campaign launch payments
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {(["submitted", "verified", "rejected", "all"] as FilterStatus[]).map(
            (s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  filter === s
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ),
          )}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-foreground"
            placeholder="Search campaigns, creators, UTR..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={fetchPayments}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Payments table */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Creator</th>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 text-right font-medium">Budget</th>
              <th className="px-4 py-3 text-right font-medium">Fee</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">UTR</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.creator_name}</p>
                  <p className="text-xs text-muted">
                    {new Date(p.submitted_at).toLocaleDateString()}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{p.campaign_title}</p>
                  <p className="text-xs text-muted capitalize">
                    Campaign: {p.campaign_status}
                  </p>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {rup(p.campaign_budget_rupees)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted">
                  {rup(Math.floor(p.platform_fee_paise / 100))}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium">
                  {rup(Math.floor(p.total_payable_paise / 100))}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{p.utr_reference}</td>
                <td className="px-4 py-3 text-center">
                  <StatusBadge status={p.payment_status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {p.payment_status === "submitted" && (
                      <>
                        <button
                          onClick={() => handleVerify(p.id)}
                          disabled={actionLoading === p.id}
                          className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          <CheckCircle size={12} />
                          Verify
                        </button>
                        <button
                          onClick={() => {
                            setRejectModal(p.id);
                            setRejectReason("");
                          }}
                          disabled={actionLoading === p.id}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          <XCircle size={12} />
                          Reject
                        </button>
                      </>
                    )}
                    {p.payment_status === "verified" && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle size={12} /> Verified
                      </span>
                    )}
                    {p.payment_status === "rejected" && (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600">
                        <XCircle size={12} /> Rejected
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  {loading ? "Loading..." : "No payment records found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Reject Payment</h3>
            <p className="mt-1 text-sm text-muted">
              Provide a reason for rejecting this payment.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              rows={3}
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectModal)}
                disabled={actionLoading === rejectModal}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === rejectModal ? "Rejecting..." : "Reject Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: "bg-amber-100 text-amber-700",
    verified: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    pending: "bg-gray-100 text-gray-700",
  };

  const icons: Record<string, React.ReactNode> = {
    submitted: <Clock size={10} />,
    verified: <CheckCircle size={10} />,
    rejected: <XCircle size={10} />,
    pending: <CreditCard size={10} />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${styles[status] || styles.pending}`}
    >
      {icons[status] || icons.pending}
      {status}
    </span>
  );
}
