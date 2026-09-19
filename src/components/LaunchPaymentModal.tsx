"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, CreditCard, Clock, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { rup } from "@/lib/format";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Campaign } from "@/lib/types";

type Phase = "form" | "processing" | "polling" | "submitted" | "verified" | "rejected";

declare global {
  interface Window {
    Cashfree?: (config: {
      mode: string;
      paymentSession: string;
    }) => { redirect: () => void };
  }
}

const CASHFREE_SCRIPT_URL = "https://sdk.cashfree.com/js/ui/2.0.0/cashfree.js";
const CASHFREE_LOAD_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

function waitForCashfree(pollMs: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Cashfree) {
      resolve(true);
      return;
    }
    const start = Date.now();
    const check = () => {
      if (window.Cashfree) {
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(check, pollMs);
      }
    };
    check();
  });
}

function loadCashfreeScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Cashfree) {
      resolve(true);
      return;
    }
    const existing = document.querySelector(`script[src="${CASHFREE_SCRIPT_URL}"]`);
    if (existing) {
      waitForCashfree(100, CASHFREE_LOAD_TIMEOUT_MS).then(resolve);
      return;
    }
    const script = document.createElement("script");
    script.src = CASHFREE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      waitForCashfree(100, CASHFREE_LOAD_TIMEOUT_MS).then(resolve);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export function LaunchPaymentModal({
  campaign,
  onClose,
  onPaymentSubmitted,
}: {
  campaign: Campaign;
  onClose: () => void;
  onPaymentSubmitted: () => void;
}) {
  const budgetRupees = campaign.budget ?? 0;
  const platformFeeRupees = Math.floor(budgetRupees * 0.10);
  const totalPayableRupees = budgetRupees + platformFeeRupees;

  const launchStatus = campaign.launchPaymentStatus;
  const isRejected = launchStatus === "rejected";
  const isSubmitted = launchStatus === "submitted";
  const isVerified = launchStatus === "verified";

  const [phase, setPhase] = useState<Phase>(
    isVerified ? "verified" : isSubmitted ? "submitted" : isRejected ? "rejected" : "form",
  );
  const [error, setError] = useState("");
  const [orderAmount, setOrderAmount] = useState(totalPayableRupees);
  const { containerRef, onKeyDown } = useFocusTrap(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refreshCampaignStatus = useCallback(async () => {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase
      .from("campaigns")
      .select("launch_payment_status")
      .eq("id", campaign.id)
      .single();
    return data?.launch_payment_status as string | null;
  }, [campaign.id]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollCountRef.current = 0;
    setPhase("polling");

    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) {
        if (pollRef.current) clearInterval(pollRef.current);
        return;
      }
      pollCountRef.current += 1;
      const status = await refreshCampaignStatus();
      if (!mountedRef.current) return;

      if (status === "verified") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("verified");
        onPaymentSubmitted();
      } else if (status === "rejected") {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("rejected");
      } else if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase("submitted");
      }
    }, POLL_INTERVAL_MS);
  }, [refreshCampaignStatus, onPaymentSubmitted]);

  async function handleCheckout() {
    setError("");
    setPhase("processing");

    try {
      const scriptLoaded = await loadCashfreeScript();
      if (!scriptLoaded || !window.Cashfree) {
        setError("Payment gateway could not be loaded. Please try again.");
        setPhase("form");
        return;
      }

      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }

      const res = await fetch("/api/campaigns/payment/cashfree/create-order", {
        method: "POST",
        headers,
        body: JSON.stringify({ campaignId: campaign.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create payment order");
      }

      if (!data.payment_session_id) {
        throw new Error("Invalid response from payment gateway");
      }

      setOrderAmount(data.amount ?? totalPayableRupees);

      const cashfree = window.Cashfree({
        mode: "sandbox",
        paymentSession: data.payment_session_id,
      });

      cashfree.redirect();

      startPolling();
    } catch (err) {
      setPhase("form");
      setError(
        err instanceof Error ? err.message : "Payment failed. Please try again.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex cursor-pointer items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        onKeyDown={onKeyDown}
        className="max-h-[88vh] w-full max-w-lg flex-col rounded-2xl border bg-card cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <CreditCard size={20} className="text-accent" />
            <h2 className="text-[16px] font-semibold">Campaign Launch Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent-soft hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 overflow-y-auto p-5">
          {/* ── Verified state ─────────────────────────── */}
          {phase === "verified" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-green/20 bg-green/5 py-6 text-center">
                <CheckCircle2 size={28} className="text-green" />
                <div>
                  <p className="text-[15px] font-semibold">Payment Verified</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Your campaign payment has been confirmed. You can now publish
                    your campaign.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90"
              >
                Close
              </button>
            </div>
          )}

          {/* ── Processing / Polling state ────────────── */}
          {(phase === "processing" || phase === "polling") && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={24} className="animate-spin text-muted" />
              <p className="text-[13px] text-muted">
                {phase === "processing"
                  ? "Opening payment checkout..."
                  : "Confirming your payment..."}
              </p>
              {phase === "polling" && (
                <p className="text-[11px] text-muted">
                  This may take a few moments. You can safely close this
                  window.
                </p>
              )}
            </div>
          )}

          {/* ── Submitted state ─────────────────────────── */}
          {phase === "submitted" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-amber/20 bg-amber/5 py-6 text-center">
                <Clock size={28} className="text-amber" />
                <div>
                  <p className="text-[15px] font-semibold">Payment Processing</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Cashfree has received your payment. We&apos;re confirming
                    it. Your campaign will be published after verification.
                  </p>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border bg-background p-4 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted">Amount</span>
                  <span className="font-mono font-medium">{rup(orderAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber">
                    <Clock size={12} /> Processing
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90"
              >
                Close
              </button>
            </div>
          )}

          {/* ── Rejected state ──────────────────────────── */}
          {phase === "rejected" && (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-red/20 bg-red/5 p-4">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
                <div className="text-[13px]">
                  <p className="font-medium text-red">Payment rejected</p>
                  <p className="mt-0.5 text-muted">
                    Your previous payment was not verified. Please try again.
                  </p>
                </div>
              </div>

              <PaymentSummary
                budget={budgetRupees}
                fee={platformFeeRupees}
                total={totalPayableRupees}
              />

              {error && <p className="text-[13px] text-red">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-medium hover:bg-accent-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckout}
                  className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90"
                >
                  Try payment again
                </button>
              </div>
            </>
          )}

          {/* ── Form state (pending / resubmit after rejected) ── */}
          {phase === "form" && (
            <>
              <PaymentSummary
                budget={budgetRupees}
                fee={platformFeeRupees}
                total={totalPayableRupees}
              />

              <p className="text-[12px] text-muted">
                To publish this campaign, a 10% ClipTwo platform fee is charged
                in addition to your campaign budget. Your{" "}
                {rup(budgetRupees)} campaign budget remains fully allocated for
                clipper campaign payouts.
              </p>

              {error && <p className="text-[13px] text-red">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-medium hover:bg-accent-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckout}
                  className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90"
                >
                  Continue to payment
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */

function PaymentSummary({
  budget,
  fee,
  total,
}: {
  budget: number;
  fee: number;
  total: number;
}) {
  return (
    <div className="space-y-2 rounded-xl border bg-background p-4">
      <div className="flex justify-between text-[13px]">
        <span className="text-muted">Campaign budget</span>
        <span className="font-mono font-medium">{rup(budget)}</span>
      </div>
      <div className="flex justify-between text-[13px]">
        <span className="text-muted">ClipTwo platform fee (10%)</span>
        <span className="font-mono font-medium">{rup(fee)}</span>
      </div>
      <div className="border-t pt-2 flex justify-between">
        <span className="text-[14px] font-medium">Total to pay</span>
        <span className="font-mono text-[16px] font-semibold">{rup(total)}</span>
      </div>
    </div>
  );
}
