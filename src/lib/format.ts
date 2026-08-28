import type { Campaign, Clip } from "./types";

export function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function fmtViews(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  // Both approved and paid clips earn money; pending/rejected do not.
  if (clip.status !== "approved" && clip.status !== "paid") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  return camp ? (clip.views / 1000) * camp.payout : 0;
}
