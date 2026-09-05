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
// Returns earnings in RUPEES for display with rup().
export function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  if (clip.status !== "approved") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  // lockedCpm is in paise; camp.payout is in rupees.
  // Convert camp.payout to paise (* 100) so the formula uses consistent units.
  const cpmPaise = clip.lockedCpm != null && clip.lockedCpm > 0
    ? clip.lockedCpm
    : (camp?.payout ?? 0) * 100;
  // lockedMaxPayout is in paise; camp.maxPayoutPerClip is in rupees.
  const maxPayoutPaise = clip.lockedMaxPayout != null && clip.lockedMaxPayout > 0
    ? clip.lockedMaxPayout
    : (camp?.maxPayoutPerClip != null ? camp.maxPayoutPerClip * 100 : undefined);
  const verifiedViews = clip.verifiedViews ?? 0;
  // gross in paise: (views / 1000) * cpm_paise
  const grossPaise = Math.round((verifiedViews / 1000) * cpmPaise);
  const cappedPaise = (maxPayoutPaise != null && maxPayoutPaise > 0)
    ? Math.min(grossPaise, maxPayoutPaise)
    : grossPaise;
  // Convert paise → rupees for display
  return cappedPaise / 100;
}

// Get net amount from a finance record (authoritative).
export function financeNetAmount(record: FinanceRecord): number {
  return record.netAmount;
}

// Get gross amount from a finance record (authoritative).
export function financeGrossAmount(record: FinanceRecord): number {
  return record.grossAmount;
}
