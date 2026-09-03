import type { Campaign, Clip, FinanceRecord } from "./types";

export function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function fmtViews(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// Client-side earnings estimate for display only.
// Server-side approve_clip() RPC creates the authoritative financial_records.
export function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  if (clip.status !== "approved") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  const cpm = clip.lockedCpm ?? camp?.payout ?? 0;
  const maxPayout = clip.lockedMaxPayout ?? camp?.maxPayoutPerClip;
  const verifiedViews = clip.verifiedViews ?? 0;
  const raw = Math.round((verifiedViews / 1000) * cpm);
  if (maxPayout != null && maxPayout > 0) {
    return Math.min(raw, maxPayout);
  }
  return raw;
}

// Get net amount from a finance record (authoritative).
export function financeNetAmount(record: FinanceRecord): number {
  return record.netAmount;
}

// Get gross amount from a finance record (authoritative).
export function financeGrossAmount(record: FinanceRecord): number {
  return record.grossAmount;
}
