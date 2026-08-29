export type Platform = "TikTok" | "YouTube" | "Instagram" | "Reels";

export type CampaignStatus = "open" | "closed";

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
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  createdAt: number;
  upi?: string;
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
  siteSettings: SiteSettings;
}
