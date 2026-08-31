import type { Campaign, Clip, ClipStatus } from "./types";
import { clipEarnings } from "./format";

// Platform commission taken from each approved payout. This is the only place
// the rate lives, so every payout view derives fee/net from it (single source
// of truth). "Net clipper amount" = gross - fee is what the clipper receives.
export const PLATFORM_FEE_RATE = 0.10;

export function platformFee(gross: number): number {
  return Math.round(gross * PLATFORM_FEE_RATE);
}

export function netClipper(gross: number): number {
  return gross - platformFee(gross);
}

// Creator-side platform fee: 10% on campaign spend.
export function creatorFee(amount: number): number {
  return Math.round(amount * PLATFORM_FEE_RATE);
}

export function netCreator(amount: number): number {
  return amount - creatorFee(amount);
}

export interface PayoutSplit {
  gross: number;
  fee: number;
  net: number;
}

export function payoutSplit(clip: Clip, campaigns: Campaign[]): PayoutSplit {
  const gross = clipEarnings(clip, campaigns);
  const fee = platformFee(gross);
  return { gross, fee, net: gross - fee };
}


// ---------------------------------------------------------------------------
// Single source of truth for all financial calculations.
//
// A clip is the financial transaction record. Its `status` drives every
// money number in the app, so all panels MUST derive figures through
// `financeOf` / `campaignSpent` below — never by re-implementing the math.
//
// Accounting rule
// ---------------
// A clip earns money once it is approved (and stays earned through payout).
//   • pending / rejected ...... no earnings (0)
//   • approved ................ earned, not yet eligible for payout
//   • payable  ................ earned, eligible for payout
//   • processing .............. payout initiated, not yet completed
//   • failed  ................. payout failed -> eligible again (outstanding)
//   • held  ................... earnings frozen (disputed), neither payable nor paid
//   • paid  ................... payout completed -> released to clipper
//
// Buckets used by every dashboard:
//   earned      = approved + payable + processing + paid + failed + held
//   outstanding = approved + payable + processing + failed   (awaiting release)
//   paid        = paid                                (released / available)
//   held        = held                                (frozen)
//   pending     = pending + rejected                  (no earnings)
// ---------------------------------------------------------------------------

// Statuses that represent earned money (clip approved and beyond).
export const EARNED_STATUSES: ClipStatus[] = [
  "approved",
  "payable",
  "processing",
  "paid",
  "failed",
  "held",
];

export function isEarned(status: ClipStatus): boolean {
  return EARNED_STATUSES.includes(status);
}

export type FinanceBucket = "pending" | "outstanding" | "paid" | "held";

export function clipBucket(status: ClipStatus): FinanceBucket {
  if (status === "paid") return "paid";
  if (status === "held") return "held";
  if (status === "pending" || status === "rejected") return "pending";
  return "outstanding"; // approved, payable, processing, failed
}

export interface Finance {
  earned: number;
  outstanding: number;
  paid: number;
  held: number;
  pending: number;
  earnedCount: number;
  outstandingCount: number;
  paidCount: number;
  heldCount: number;
  pendingCount: number;
  rejectedCount: number;
}

export function financeOf(
  clips: Clip[],
  campaigns: Campaign[],
  filter?: (k: Clip) => boolean,
): Finance {
  const f = filter ?? (() => true);
  const acc: Finance = {
    earned: 0,
    outstanding: 0,
    paid: 0,
    held: 0,
    pending: 0,
    earnedCount: 0,
    outstandingCount: 0,
    paidCount: 0,
    heldCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  };

  for (const k of clips) {
    if (!f(k)) continue;
    const e = clipEarnings(k, campaigns);
    const bucket = clipBucket(k.status);
    if (bucket === "paid") {
      acc.paid += e;
      acc.paidCount++;
    } else if (bucket === "held") {
      acc.held += e;
      acc.heldCount++;
    } else if (bucket === "outstanding") {
      acc.outstanding += e;
      acc.outstandingCount++;
    } else {
      acc.pending += e;
      acc.pendingCount++;
    }
    if (isEarned(k.status)) {
      acc.earned += e;
      acc.earnedCount++;
    }
    if (k.status === "rejected") acc.rejectedCount++;
  }
  return acc;
}

// Money actually paid out for one campaign — derived from its clips, so it
// can never drift from the clip ledger (single source of truth).
export function campaignSpent(campaign: Campaign, clips: Clip[]): number {
  return financeOf(clips, [campaign], (k) => k.campaignId === campaign.id).paid;
}

// ---------------------------------------------------------------------------
// Strict campaign budget protection
//
// Every financial operation must go through these guards. The campaign's
// `budget` is the hard ceiling — no combination of earned clips may exceed it.
// ---------------------------------------------------------------------------

export interface CampaignBudget {
  total: number;
  spent: number;
  payable: number;
  reserved: number;
  remaining: number;
  utilizationPct: number;
  status: "ok" | "near_budget" | "budget_reached";
}

const NEAR_BUDGET_THRESHOLD = 0.9;

export function campaignBudget(campaign: Campaign, clips: Clip[]): CampaignBudget {
  const budget = campaign.budget ?? 0;
  const fin = financeOf(
    clips,
    [campaign],
    (k) => k.campaignId === campaign.id,
  );
  const spent = fin.paid;
  const payable = fin.outstanding;
  const reserved = spent + payable;
  const remaining = Math.max(0, budget - reserved);
  const utilizationPct = budget > 0 ? Math.min(100, (reserved / budget) * 100) : 0;

  let status: CampaignBudget["status"] = "ok";
  if (budget > 0 && reserved >= budget) {
    status = "budget_reached";
  } else if (budget > 0 && utilizationPct >= NEAR_BUDGET_THRESHOLD * 100) {
    status = "near_budget";
  }

  return { total: budget, spent, payable, reserved, remaining, utilizationPct, status };
}

export function canAcceptMorePayable(campaign: Campaign, clips: Clip[]): boolean {
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return true;
  const b = campaignBudget(campaign, clips);
  return b.remaining > 0 && b.status !== "budget_reached";
}

export function canAcceptSubmission(campaign: Campaign, clips: Clip[]): boolean {
  if (campaign.status !== "open") return false;
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return true;
  const b = campaignBudget(campaign, clips);
  return b.status === "ok";
}

export function wouldExceedBudget(
  campaign: Campaign,
  clips: Clip[],
  additionalEarnings: number,
): boolean {
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return false;
  const b = campaignBudget(campaign, clips);
  return b.remaining < additionalEarnings;
}

export function budgetStatusText(campaign: Campaign, clips: Clip[]): string {
  const b = campaignBudget(campaign, clips);
  if (b.status === "budget_reached") return "Budget Reached";
  if (b.status === "near_budget") return "Near Budget";
  return "OK";
}
