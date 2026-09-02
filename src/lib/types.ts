export type Platform = "YouTube" | "Instagram" | "Kick";

export type CampaignStatus =
  | "open"
  | "closed"
  | "draft"
  | "paused"
  | "archived"
  | "budget_reached"
  | "near_budget";

export interface CampaignSourceAsset {
  label: string;
  url: string;
}

export interface CampaignExampleClip {
  url: string;
  caption?: string;
  platform?: Platform;
}

export interface CampaignViewRules {
  verifiedView?: string;
  whenCounted?: string;
  updateFrequency?: string;
  minViews?: number;
  maxPayout?: number;
  deletedPolicy?: string;
}

export interface CampaignApproval {
  afterSubmission?: string;
  reviewTime?: string;
  criteria?: string;
  rejectionReasons?: string[];
  appeal?: string;
  autoReview?: boolean;
}

export interface CampaignRights {
  ads: boolean;
  social: boolean;
  website: boolean;
  other: boolean;
  otherText?: string;
}

export interface Campaign {
  id: string;
  title: string;
  creator: string;
  brief: string;
  platform: Platform;
  payout: number;
  status: CampaignStatus;
  createdAt: number;
  niche?: string;
  budget?: number;
  spent?: number;
  reservedBudget?: number;
  remainingBudget?: number;
  daysLeft?: number;
  sourceLink?: string;
  rules?: string;
  created_by?: string;
  archived_at?: string;
  archived_by?: string;

  // Extended campaign detail
  category?: string;
  platforms?: Platform[];
  verified?: boolean;
  objective?: string;
  startDate?: string;
  endDate?: string;
  maxPayoutPerClip?: number;
  recommendedDuration?: string;
  hook?: string;
  captionReq?: string;
  aspectRatio?: string;
  cta?: string;
  branding?: string;
  doList?: string[];
  dontList?: string[];
  sourceAssets?: CampaignSourceAsset[];
  exampleClips?: CampaignExampleClip[];
  viewRules?: CampaignViewRules;
  approval?: CampaignApproval;
  thumbnails?: string[];
  brandAssets?: CampaignSourceAsset[];
  spendCap?: number;
  timezone?: string;
  whatToMake?: string;
  style?: string;
  rights?: CampaignRights;
  audit?: AuditEntry[];
}

// ── Clip moderation status (content review only, no financial meaning) ──────
export type ClipStatus = "pending" | "approved" | "rejected" | "held";

// ── Financial record status (payment lifecycle) ─────────────────────────────
export type FinanceStatus = "pending" | "processing" | "paid";

export type ProfileRole = "clipper" | "creator" | "admin";
export type ProfileStatus = "active" | "suspended" | "deactivated";

export interface ClipEngagement {
  likes?: number;
  comments?: number;
  shares?: number;
}

export interface AuditEntry {
  action: string;
  by?: string;
  at: number;
  note?: string;
}

export type Severity = "low" | "medium" | "high";
export type RiskType =
  | "fake_views"
  | "spam"
  | "copyright"
  | "duplicate"
  | "bot_traffic"
  | "policy_violation"
  | "account_sharing"
  | "content_theft"
  | "other";
export type RiskStatus = "New" | "Under Review" | "Cleared" | "Confirmed" | "Held";

export interface RiskFlag {
  type: RiskType;
  severity: Severity;
  note?: string;
  flaggedBy?: string;
  at: number;
  status?: RiskStatus;
}

export interface Clip {
  id: string;
  campaignId: string;
  clipper: string;
  videoUrl: string;
  caption: string;
  status: ClipStatus;
  views: number;
  verifiedViews?: number;
  submittedAt: number;
  platform?: Platform;
  userId?: string;
  rejectionReason?: string;
  rejectionDetails?: string;
  heldReason?: string;
  updatedAt?: number;
  engagement?: ClipEngagement;
  audit?: AuditEntry[];
  riskFlags?: RiskFlag[];
  verified?: boolean;
  lockedCpm?: number;
  lockedMaxPayout?: number;
}

// ── Financial record (immutable once created) ───────────────────────────────
// Created when admin approves a clip. Contains all payment lifecycle data.
export interface FinanceRecord {
  id: string;
  clipId: string;
  campaignId: string;
  clipperId?: string;
  // Immutable financial values (calculated at approval time)
  lockedCpm: number;           // CPM in paise (₹220 = 22000)
  lockedMaxPayout?: number;    // Max payout per clip in paise
  verifiedViews: number;       // Views used for calculation
  grossAmount: number;         // In paise
  platformFee: number;         // In paise (10% of gross)
  netAmount: number;           // In paise (gross - platform_fee)
  // Payment lifecycle
  status: FinanceStatus;
  upiIdSnapshot?: string;      // UPI at time of request
  paymentReference?: string;   // Manual payment reference (neft/ref no)
  paidBy?: string;             // Admin who confirmed payment
  // Timestamps
  createdAt: number;
  processingAt?: number;
  paidAt?: number;
  // Audit
  audit?: AuditEntry[];
}

// ── Payout request (clipper-initiated) ──────────────────────────────────────
export type PayoutRequestStatus = "pending" | "processing" | "paid";

export interface PayoutRequest {
  id: string;
  userId: string;
  amount: number;              // Total requested in paise
  netAmount: number;           // Net after fees in paise
  currency: string;
  status: PayoutRequestStatus;
  method: string;              // 'upi'
  upiId: string;               // Snapshot of UPI at request time
  paymentReference?: string;   // Admin-provided reference
  paidBy?: string;             // Admin who confirmed
  createdAt: number;
  processingAt?: number;
  paidAt?: number;
  financeRecordIds: string[];  // Which finance records this payout covers
  audit?: AuditEntry[];
}

export interface Appeal {
  id: string;
  clipId?: string;
  campaignId?: string;
  reason: string;
  status: "open" | "reviewing" | "approved" | "rejected";
  at: number;
  response?: string;
}

export interface TeamMember {
  name: string;
  email?: string;
  role?: string;
}

export interface Profile {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  verified?: boolean;
  verifiedAt?: number;
  createdAt: number;
  upi?: string;
  bio?: string;
  company?: string;
  team?: TeamMember[];
  riskFlag?: boolean;
  riskNote?: string;
  adminNotes?: string;
  suspendedReason?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  appeals?: Appeal[];
  audit?: AuditEntry[];
}

export type SocialAccountStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "verified"
  | "connection_error"
  | "disconnected"
  | "verification_failed";

export interface SocialAccount {
  id: string;
  userId?: string;
  platform: Platform;
  handle: string;
  providerAccountId?: string;
  avatarUrl?: string;
  status: SocialAccountStatus;
  verified: boolean;
  connectedAt?: number;
  lastSyncAt?: number;
  error?: string;
}

export interface SiteSettings {
  heroTitle: string;
  heroSubtitle: string;
  featuredIds: string[];
}

export interface StoreState {
  campaigns: Campaign[];
  clips: Clip[];
  profiles: Profile[];
  socialAccounts: SocialAccount[];
  financeRecords: FinanceRecord[];
  payoutRequests: PayoutRequest[];
  siteSettings: SiteSettings;
  savedCampaigns: string[];
  lastError?: string;
}

export type AuditAction =
  | "user_created"
  | "user_suspended"
  | "user_reactivated"
  | "user_verified"
  | "user_unverified"
  | "campaign_created"
  | "campaign_edited"
  | "campaign_paused"
  | "campaign_ended"
  | "campaign_closed"
  | "clip_approved"
  | "clip_rejected"
  | "clip_held"
  | "finance_created"
  | "finance_processing"
  | "finance_paid"
  | "payout_requested"
  | "payout_processing"
  | "payout_paid"
  | "fraud_flag_created"
  | "fraud_flag_cleared"
  | "account_changed"
  | "permission_changed"
  | "admin_notes"
  | "appeal_response"
  | "risk_flagged"
  | "risk_cleared"
  | "user_deactivated"
  | "user_self_deactivated"
  | "other";

export interface AuditLog {
  id: string;
  timestamp: number;
  actor: string;
  action: AuditAction;
  targetType: "user" | "campaign" | "clip" | "finance" | "payout" | "system" | "fraud";
  targetId: string;
  targetLabel?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}
