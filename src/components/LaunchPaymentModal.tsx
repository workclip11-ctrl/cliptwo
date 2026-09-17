"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, CreditCard, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { rup } from "@/lib/format";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Campaign } from "@/lib/types";

type Phase = "form" | "submitting" | "submitted";

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

  const isRejected = campaign.launchPaymentStatus === "rejected";
  const isSubmitted = campaign.launchPaymentStatus === "submitted";

  const [phase, setPhase] = useState<Phase>(isSubmitted ? "submitted" : "form");
  const [utrReference, setUtrReference] = useState("");
  const [error, setError] = useState("");
  const { containerRef, onKeyDown } = useFocusTrap(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    const trimmed = utrReference.trim();
    if (!trimmed || trimmed.length < 6) {
      setError("UTR must be at least 6 characters.");
      return;
    }
    if (trimmed.length > 50) {
      setError("UTR must be 50 characters or fewer.");
      return;
    }

    setPhase("submitting");
    setError("");

    try {
      let headers: Record<string, string> = { "Content-Type": "application/json" };
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          headers = { ...headers, Authorization: `Bearer ${token}` };
        }
      }

      const res = await fetch("/api/campaigns/payment/submit", {
        method: "POST",
        headers,
        body: JSON.stringify({
          campaignId: campaign.id,
          utrReference: trimmed,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Payment submission failed");
      }

      setPhase("submitted");
      onPaymentSubmitted();
    } catch (err) {
      setPhase("form");
      setError(
        err instanceof Error ? err.message : "Payment submission failed. Please try again.",
      );
    }
  }

  const upiUri = `upi://pay?pa=9315851024@ptyes&pn=Cliptwo&am=${totalPayableRupees}&cu=INR`;

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
          {/* ── Submitted state ─────────────────────────── */}
          {phase === "submitted" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center gap-3 rounded-xl border border-amber/20 bg-amber/5 py-6 text-center">
                <Clock size={28} className="text-amber" />
                <div>
                  <p className="text-[15px] font-semibold">Payment Submitted</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Your campaign will be published after ClipTwo verifies your
                    payment.
                  </p>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border bg-background p-4 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-muted">Amount</span>
                  <span className="font-mono font-medium">{rup(totalPayableRupees)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">UTR / Reference</span>
                  <span className="font-mono text-xs">{utrReference || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber">
                    <Clock size={12} /> Pending verification
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
          {phase === "form" && isRejected && (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-red/20 bg-red/5 p-4">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
                <div className="text-[13px]">
                  <p className="font-medium text-red">Payment rejected</p>
                  <p className="mt-0.5 text-muted">
                    Your previous payment was not verified. Please submit a new
                    payment with a valid UTR.
                  </p>
                </div>
              </div>

              {/* Payment summary */}
              <PaymentSummary
                budget={budgetRupees}
                fee={platformFeeRupees}
                total={totalPayableRupees}
              />

              {/* QR */}
              <QRSection upiUri={upiUri} total={totalPayableRupees} />

              {/* UTR */}
              <UtrInput value={utrReference} onChange={setUtrReference} />

              {error && <p className="text-[13px] text-red">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-medium hover:bg-accent-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!utrReference.trim()}
                  className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Payment
                </button>
              </div>
            </>
          )}

          {/* ── Form state (pending / resubmit after rejected) ── */}
          {phase === "form" && !isRejected && (
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

              <QRSection upiUri={upiUri} total={totalPayableRupees} />

              <UtrInput value={utrReference} onChange={setUtrReference} />

              {error && <p className="text-[13px] text-red">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border px-4 py-2.5 text-[13px] font-medium hover:bg-accent-soft"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!utrReference.trim()}
                  className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {"I've Paid \u2014 Submit for Verification"}
                </button>
              </div>
            </>
          )}

          {/* ── Submitting spinner ──────────────────────── */}
          {phase === "submitting" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={24} className="animate-spin text-muted" />
              <p className="text-[13px] text-muted">Submitting payment...</p>
            </div>
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

function QRSection({ upiUri, total }: { upiUri: string; total: number }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-background p-5">
      <p className="text-[13px] font-medium">Scan to Pay</p>
      <div className="rounded-lg border bg-white p-3">
        <QRCodeSVG value={upiUri} size={200} level="M" includeMargin={false} />
      </div>
      <div className="text-center space-y-0.5">
        <p className="text-[16px] font-semibold font-mono">{rup(total)}</p>
        <p className="text-[11px] text-muted">ClipTwo Campaign Payment</p>
      </div>
      <p className="max-w-xs text-center text-[11px] text-muted">
        Please verify the payment amount before completing the transaction.
        Your campaign will be published only after ClipTwo verifies your
        payment.
      </p>
    </div>
  );
}

function UtrInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium">
        UTR / Payment Reference
      </label>
      <input
        className="w-full rounded-lg border bg-background px-3 py-2 text-[13px] outline-none focus:border-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter UTR or transaction reference number"
        maxLength={50}
      />
    </div>
  );
}
