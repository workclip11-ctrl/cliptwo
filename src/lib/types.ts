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
  payableWhen?: string;
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
  payableAmount?: number;
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

export type ClipStatus =
  | "pending"
  | "approved"
  | "payable"
  | "processing"
  | "paid"
  | "failed"
  | "held"
  | "rejected";

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
  failureReason?: string;
  heldReason?: string;
  txnId?: string;
  payoutRef?: string;
  updatedAt?: number;
  payoutDate?: number;
  engagement?: ClipEngagement;
  audit?: AuditEntry[];
  riskFlags?: RiskFlag[];
  verified?: boolean;
  lockedCpm?: number;
  lockedMaxPayout?: number;
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

// A connected social account for a clipper. Only non-secret metadata lives here.
// OAuth tokens / access secrets are stored in social_connections (server-only,
// RLS forbids browser SELECT on token columns). The client never receives them.
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
  razorpayKey: string;
}

export interface StoreState {
  campaigns: Campaign[];
  clips: Clip[];
  profiles: Profile[];
  socialAccounts: SocialAccount[];
  siteSettings: SiteSettings;
  savedCampaigns: string[];
}

// ── Centralized Admin Audit Log ──────────────────────────────────────────────

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
  | "earnings_adjusted"
  | "payout_initiated"
  | "payout_completed"
  | "payout_failed"
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
  targetType: "user" | "campaign" | "clip" | "system" | "fraud";
  targetId: string;
  targetLabel?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
}
