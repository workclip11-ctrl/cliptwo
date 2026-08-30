export type Platform = "TikTok" | "YouTube" | "Instagram" | "Reels";

export type CampaignStatus = "open" | "closed" | "draft" | "paused";

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
  daysLeft?: number;
  sourceLink?: string;
  rules?: string;
  created_by?: string;

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
export type ProfileStatus = "active" | "suspended";

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
  company?: string;
  team?: TeamMember[];
  riskFlag?: boolean;
  riskNote?: string;
  adminNotes?: string;
  suspendedReason?: string;
  appeals?: Appeal[];
  audit?: AuditEntry[];
}

export type SocialAccountStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "verified"
  | "connection_error"
  | "disconnected";

// A connected social account for a clipper. Only non-secret metadata lives here.
// OAuth tokens / access secrets must NEVER be stored on the client or in this
// table — they belong in a server-only secret store (see supabase/schema.sql).
export interface SocialAccount {
  id: string;
  userId?: string;
  platform: Platform;
  handle: string;
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
