import type { Campaign, FinanceRecord, FinanceStatus } from "./types";

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


// ---------------------------------------------------------------------------
// Single source of truth for all financial calculations.
//
// Financial records are the authoritative source. Each record has a status
// that drives all money numbers in the app. All panels MUST derive figures
// through `financeOf` / `campaignSpent` below.
//
// Finance lifecycle:
//   pending   → financial record created (clip approved)
//   processing → admin initiated manual UPI payment
//   paid      → admin confirmed UPI payment
// ---------------------------------------------------------------------------

export const FINANCE_ACTIVE_STATUSES: FinanceStatus[] = ["pending", "processing", "paid"];

export function isFinanceActive(status: FinanceStatus): boolean {
  return FINANCE_ACTIVE_STATUSES.includes(status);
}

export type FinanceBucket = "pending" | "processing" | "paid";

export function financeBucket(status: FinanceStatus): FinanceBucket {
  return status; // Simple 1:1 mapping
}

export interface Finance {
  total: number;
  pending: number;
  processing: number;
  paid: number;
  totalCount: number;
  pendingCount: number;
  processingCount: number;
  paidCount: number;
}

export function financeOf(
  records: FinanceRecord[],
  filter?: (r: FinanceRecord) => boolean,
): Finance {
  const f = filter ?? (() => true);
  const acc: Finance = {
    total: 0,
    pending: 0,
    processing: 0,
    paid: 0,
    totalCount: 0,
    pendingCount: 0,
    processingCount: 0,
    paidCount: 0,
  };

  for (const r of records) {
    if (!f(r)) continue;
    const bucket = financeBucket(r.status);
    acc.total += r.netAmount;
    acc.totalCount++;
    if (bucket === "paid") {
      acc.paid += r.netAmount;
      acc.paidCount++;
    } else if (bucket === "processing") {
      acc.processing += r.netAmount;
      acc.processingCount++;
    } else {
      acc.pending += r.netAmount;
      acc.pendingCount++;
    }
  }
  return acc;
}

// Money actually paid out for one campaign — derived from finance records.
export function campaignSpent(campaign: Campaign, records: FinanceRecord[]): number {
  return financeOf(records, (r) => r.campaignId === campaign.id && r.status === "paid").paid;
}

// ---------------------------------------------------------------------------
// Strict campaign budget protection
// ---------------------------------------------------------------------------

export interface CampaignBudget {
  total: number;
  spent: number;
  committed: number;
  reserved: number;
  remaining: number;
  utilizationPct: number;
  status: "ok" | "near_budget" | "budget_reached";
}

const NEAR_BUDGET_THRESHOLD = 0.9;

export function campaignBudget(campaign: Campaign, records: FinanceRecord[]): CampaignBudget {
  const budget = campaign.budget ?? 0;
  const fin = financeOf(records, (r) => r.campaignId === campaign.id);
  const spent = fin.paid;
  const committed = fin.pending + fin.processing;
  const reserved = spent + committed;
  const remaining = Math.max(0, budget - reserved);
  const utilizationPct = budget > 0 ? Math.min(100, (reserved / budget) * 100) : 0;

  let status: CampaignBudget["status"] = "ok";
  if (budget > 0 && reserved >= budget) {
    status = "budget_reached";
  } else if (budget > 0 && utilizationPct >= NEAR_BUDGET_THRESHOLD * 100) {
    status = "near_budget";
  }

  return { total: budget, spent, committed, reserved, remaining, utilizationPct, status };
}

export function canAcceptMoreCommitted(campaign: Campaign, records: FinanceRecord[]): boolean {
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return true;
  const b = campaignBudget(campaign, records);
  return b.remaining > 0 && b.status !== "budget_reached";
}

export function canAcceptSubmission(campaign: Campaign, records: FinanceRecord[]): boolean {
  if (campaign.status !== "open") return false;
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return true;
  const b = campaignBudget(campaign, records);
  return b.status === "ok";
}

export function wouldExceedBudget(
  campaign: Campaign,
  records: FinanceRecord[],
  additionalEarnings: number,
): boolean {
  const budget = campaign.budget ?? 0;
  if (budget <= 0) return false;
  const b = campaignBudget(campaign, records);
  return b.remaining < additionalEarnings;
}

export function budgetStatusText(campaign: Campaign, records: FinanceRecord[]): string {
  const b = campaignBudget(campaign, records);
  if (b.status === "budget_reached") return "Budget Reached";
  if (b.status === "near_budget") return "Near Budget";
  return "OK";
}
