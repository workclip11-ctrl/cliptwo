"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  Search,
  RefreshCw,
} from "lucide-react";
import { rup } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

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

const STATUS_TABS: Array<{ key: FilterStatus; label: string }> = [
  { key: "submitted", label: "Submitted" },
  { key: "verified", label: "Verified" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

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
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }
      const res = await fetch("/api/campaigns/payment/verify", {
        method: "POST",
        headers,
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
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }
      const res = await fetch("/api/campaigns/payment/reject", {
        method: "POST",
        headers,
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

  const counts = useMemo(() => ({
    total: payments.length,
    submitted: payments.filter((p) => p.payment_status === "submitted").length,
    verified: payments.filter((p) => p.payment_status === "verified").length,
    rejected: payments.filter((p) => p.payment_status === "rejected").length,
  }), [payments]);

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[30px]">
          Campaign Payments
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Verify creator campaign launch payments
        </p>
      </div>

      {/* ── Summary metrics ─────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight">
            {counts.total}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Total</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight text-amber">
            {counts.submitted}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Submitted</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight text-green">
            {counts.verified}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Verified</p>
        </div>
        <div>
          <p className="text-[20px] font-mono font-bold tracking-tight text-red">
            {counts.rejected}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">Rejected</p>
        </div>
      </div>

      {/* ── Toolbar: tabs + search + refresh ────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`cursor-pointer rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium transition-colors duration-150 ${
                filter === t.key
                  ? "bg-foreground text-background"
                  : "border border-border/50 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors focus:border-foreground/30"
              placeholder="Search campaigns, creators, UTR…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={fetchPayments}
            disabled={loading}
            className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] border border-border/60 bg-card px-4 text-[14px] font-medium text-muted transition-colors hover:border-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[14px]">
            <thead>
              <tr className="border-b border-border/40 text-left text-[13px] text-muted">
                <th className="px-5 py-3 font-medium">Creator</th>
                <th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 text-right font-medium">Budget</th>
                <th className="px-5 py-3 text-right font-medium">Fee</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
                <th className="px-5 py-3 font-medium">UTR</th>
                <th className="px-5 py-3 text-center font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-accent-soft/50">
                  {/* Creator */}
                  <td className="px-5 py-4">
                    <p className="font-medium">{p.creator_name}</p>
                    <p className="text-[13px] text-muted">
                      {new Date(p.submitted_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </td>

                  {/* Campaign */}
                  <td className="px-5 py-4">
                    <p className="font-medium">{p.campaign_title}</p>
                    <p className="text-[13px] capitalize text-muted">
                      {p.campaign_status}
                    </p>
                  </td>

                  {/* Budget */}
                  <td className="px-5 py-4 text-right font-mono text-[15px]">
                    {rup(p.campaign_budget_rupees)}
                  </td>

                  {/* Fee */}
                  <td className="px-5 py-4 text-right font-mono text-[15px] text-muted">
                    {rup(Math.floor(p.platform_fee_paise / 100))}
                  </td>

                  {/* Total */}
                  <td className="px-5 py-4 text-right font-mono text-[16px] font-semibold">
                    {rup(Math.floor(p.total_payable_paise / 100))}
                  </td>

                  {/* UTR */}
                  <td className="px-5 py-4 font-mono text-[13px]">
                    {p.utr_reference || "—"}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4 text-center">
                    <StatusBadge status={p.payment_status} />
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {p.payment_status === "submitted" && (
                        <>
                          <button
                            onClick={() => handleVerify(p.id)}
                            disabled={actionLoading === p.id}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] bg-green/10 px-3 text-[13px] font-medium text-green transition-colors hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle size={14} />
                            Verify
                          </button>
                          <button
                            onClick={() => {
                              setRejectModal(p.id);
                              setRejectReason("");
                            }}
                            disabled={actionLoading === p.id}
                            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] bg-red/10 px-3 text-[13px] font-medium text-red transition-colors hover:bg-red/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <XCircle size={14} />
                            Reject
                          </button>
                        </>
                      )}
                      {p.payment_status === "verified" && (
                        <span className="inline-flex items-center gap-1 text-[13px] text-green">
                          <CheckCircle size={14} /> Verified
                        </span>
                      )}
                      {p.payment_status === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-[13px] text-red">
                          <XCircle size={14} /> Rejected
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <p className="text-[15px] font-medium">
                      {loading ? "Loading payments…" : "No payment records found."}
                    </p>
                    {!loading && (
                      <p className="mt-1 text-[13px] text-muted">
                        Campaign payments will appear here when creators submit launch payments.
                      </p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Reject modal ────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-[460px] rounded-xl border border-border/40 bg-card p-6 shadow-xl">
            <h3 className="text-[18px] font-bold tracking-tight">Reject Payment</h3>
            <p className="mt-1.5 text-[14px] text-muted">
              Provide a reason for rejecting this payment. The creator will be notified.
            </p>
            <textarea
              className="mt-4 w-full rounded-[8px] border border-border/60 bg-background px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-foreground/30"
              rows={3}
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason("");
                }}
                className="inline-flex h-11 cursor-pointer items-center rounded-[8px] border border-border/60 px-4 text-[14px] font-medium transition-colors hover:bg-accent-soft"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectModal)}
                disabled={actionLoading === rejectModal}
                className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-[8px] bg-red px-4 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading === rejectModal ? "Rejecting…" : "Reject Payment"}
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
    submitted: "bg-amber/10 text-amber",
    verified: "bg-green/10 text-green",
    rejected: "bg-red/10 text-red",
    pending: "bg-muted/10 text-muted",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium capitalize ${styles[status] || styles.pending}`}
    >
      {status}
    </span>
  );
}
