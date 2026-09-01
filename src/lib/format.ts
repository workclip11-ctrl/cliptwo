import type { Campaign, Clip } from "./types";
import { isEarned } from "./finance";

export function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function fmtViews(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  // Any earned clip (approved and beyond) earns money; pending/rejected do not.
  if (!isEarned(clip.status)) return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  if (!camp) return 0;
  // Earnings use verifiedViews (platform-confirmed), NOT submitted views.
  // This is a display-only estimate — the authoritative calculation is in
  // create_earning() which runs server-side in integer paise.
  const verifiedViews = clip.verifiedViews ?? 0;
  const raw = Math.round((verifiedViews / 1000) * camp.payout);
  if (camp.maxPayoutPerClip != null && camp.maxPayoutPerClip > 0) {
    return Math.min(raw, camp.maxPayoutPerClip);
  }
  return raw;
}
