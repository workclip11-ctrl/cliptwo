export type Platform = "TikTok" | "YouTube" | "Instagram" | "Reels";

export type CampaignStatus = "open" | "closed";

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
}

export type ClipStatus = "pending" | "approved" | "rejected" | "paid";

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
