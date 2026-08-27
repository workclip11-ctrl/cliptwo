export type Platform = "TikTok" | "YouTube" | "Instagram" | "Reels";

export type CampaignStatus = "open" | "closed";

export interface Campaign {
  id: string;
  title: string;
  creator: string;
  brief: string;
  platform: Platform;
  payout: number; // CPM — ₹ per 1,000 verified views
  status: CampaignStatus;
  createdAt: number;
  niche?: string;
  budget?: number;
  spent?: number;
  daysLeft?: number;
  sourceLink?: string;
  rules?: string;
}

export type ClipStatus = "pending" | "approved" | "rejected";

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
}

export interface StoreState {
  campaigns: Campaign[];
  clips: Clip[];
}
