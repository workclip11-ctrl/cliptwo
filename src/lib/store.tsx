"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  Campaign,
  CampaignStatus,
  CampaignSourceAsset,
  CampaignExampleClip,
  CampaignViewRules,
  CampaignApproval,
  CampaignRights,
  Clip,
  ClipStatus,
  Platform,
  Profile,
  ProfileRole,
  ProfileStatus,
  SocialAccount,
  SocialAccountStatus,
  SiteSettings,
  StoreState,
} from "./types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const isoInDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const seed: StoreState = {
  campaigns: [
    {
      id: "c1",
      title: "Launch teaser for our new app",
      creator: "Northwind Labs",
      brief: "Cut a 20s hook from the keynote. Punchy, fast-paced, end on CTA.",
      platform: "Instagram",
      payout: 220,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      niche: "Tech",
      category: "Tech",
      budget: 40000,
      spent: 4048,
      daysLeft: 12,
      sourceLink: "https://drive.google.com/drive/folders/launch-teaser",
      rules: "Cut a 20s hook from the keynote. Punchy, fast-paced, end on CTA. No watermarks.",
      platforms: ["Instagram", "YouTube", "TikTok"],
      verified: true,
      objective:
        "Drive pre-launch awareness for our new productivity app. We want snappy, relatable cuts that land the 'aha' moment and push viewers to install.",
      startDate: isoDaysAgo(2),
      endDate: isoInDays(10),
      maxPayoutPerClip: 5000,
      recommendedDuration: "15–30s",
      hook: "Open with the 'this app is unhinged' moment in the first 3 seconds.",
      captionReq: "English caption + 3 hashtags (#productivity #app #tech). Subtitles on.",
      aspectRatio: "9:16 vertical",
      cta: "Link in bio → install ClipTwo.",
      branding: "Keep our logo in the last 2s. No competitor mentions.",
      doList: [
        "Use the official keynote footage",
        "Show a real, relatable use-case",
        "Fast cuts under 1s between beats",
      ],
      dontList: [
        "No watermarks or other brand logos",
        "No fake engagement or bots",
        "Don't misrepresent app features",
      ],
      sourceAssets: [
        { label: "Keynote raw (Drive)", url: "https://drive.google.com/drive/folders/launch-teaser" },
      ],
      exampleClips: [],
      viewRules: {
        verifiedView: "A view counts when watched past 3s by a unique account.",
        whenCounted: "Counted 48h after the post goes live.",
        updateFrequency: "Refreshed every 24h.",
        minViews: 1000,
        maxPayout: 5000,
        deletedPolicy: "If the post is deleted or set private, earnings are reversed.",
        payableWhen: "Becomes payable once approved and views stabilise (48h).",
      },
      approval: {
        afterSubmission: "You'll get a submission ticket linked to this campaign.",
        reviewTime: "Within 48 hours.",
        criteria: "Original, on-brief, vertical, clear hook in first 3s.",
        rejectionReasons: ["Watermark", "Off-brief", "Low retention"],
        appeal: "Reply to the decision email within 7 days.",
      },
    },
    {
      id: "c2",
      title: "Workout routine highlight",
      creator: "FitForm",
      brief: "Turn the 12-min session into 3 separate 30s reels. Vertical only.",
      platform: "Reels",
      payout: 160,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
      niche: "Fitness",
      category: "Fitness",
      budget: 25000,
      spent: 1920,
      daysLeft: 26,
      sourceLink: "https://drive.google.com/drive/folders/workout-routine",
      rules: "Turn the 12-min session into 3 separate 30s reels. Vertical only. Upbeat music.",
      platforms: ["Reels", "Instagram", "TikTok"],
      verified: true,
      objective:
        "Repurpose our 12-minute workout into snackable reels that people actually finish and save.",
      startDate: isoDaysAgo(1),
      endDate: isoInDays(25),
      maxPayoutPerClip: 3000,
      recommendedDuration: "25–35s",
      hook: "Show the result first (better posture) then the move.",
      captionReq: "Upbeat tone, mention @fitform, add #homeworkout.",
      aspectRatio: "9:16 vertical",
      cta: "Save this routine & follow @fitform.",
      branding: "Keep 'FitForm' lower-third for 3s.",
      doList: [
        "Make 3 separate reels from the session",
        "Use trending fitness audio",
        "Show before/after posture",
      ],
      dontList: [
        "No horizontal footage",
        "No medical claims",
        "No other gym tags",
      ],
      sourceAssets: [
        { label: "Full session (Drive)", url: "https://drive.google.com/drive/folders/workout-routine" },
      ],
      exampleClips: [],
      viewRules: {
        verifiedView: "Unique view past 5s with sound on.",
        whenCounted: "Counted 24h after posting.",
        updateFrequency: "Every 12h.",
        minViews: 500,
        maxPayout: 3000,
        deletedPolicy: "Private/deleted posts forfeit earnings.",
        payableWhen: "Payable 24h after approval.",
      },
      approval: {
        afterSubmission: "Ticket created under your clipper profile.",
        reviewTime: "Within 24 hours.",
        criteria: "Vertical, on-brand, clear transformation.",
        rejectionReasons: ["Horizontal", "Off-brand", "Medical claim"],
        appeal: "Open a help ticket within 5 days.",
      },
    },
    {
      id: "c3",
      title: "Founder story short",
      creator: "Maker House",
      brief: "Use the intro monologue. Emotional, cinematic, subtitles on.",
      platform: "YouTube",
      payout: 280,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      niche: "Finance",
      category: "Finance",
      budget: 60000,
      spent: 0,
      daysLeft: 9,
      sourceLink: "https://drive.google.com/drive/folders/founder-story",
      rules: "Vertical 9:16 only. Keep the monologue intact. English subtitles required.",
      platforms: ["YouTube", "Instagram", "TikTok"],
      verified: false,
      objective:
        "Make our founder's origin story land with first-time founders and builders.",
      startDate: isoDaysAgo(6),
      endDate: isoInDays(9),
      maxPayoutPerClip: 8000,
      recommendedDuration: "30–60s",
      hook: "Start on the emotional line, not the logo.",
      captionReq: "English subtitles required. Keep monologue intact.",
      aspectRatio: "9:16 vertical",
      cta: "Follow Maker House for build diaries.",
      branding: "Subtle Maker House lower-third, no outro splash.",
      doList: [
        "Keep the monologue intact",
        "Cinematic grade, stable shots",
        "Burn-in English subtitles",
      ],
      dontList: [
        "Don't cut the monologue",
        "No fake subtitles",
        "No stock footage",
      ],
      sourceAssets: [
        { label: "Founder interview (Drive)", url: "https://drive.google.com/drive/folders/founder-story" },
      ],
      exampleClips: [],
      viewRules: {
        verifiedView: "Unique viewer past 10s.",
        whenCounted: "Counted 72h after posting.",
        updateFrequency: "Every 24h.",
        minViews: 2000,
        maxPayout: 8000,
        deletedPolicy: "Deleted posts reverse all earnings.",
        payableWhen: "Payable 72h after approval.",
      },
      approval: {
        afterSubmission: "Ticket created, reviewed by brand team.",
        reviewTime: "Within 72 hours.",
        criteria: "Cinematic, intact monologue, correct subtitles.",
        rejectionReasons: ["Cut monologue", "No subtitles", "Reused stock"],
        appeal: "Email founders@makerhouse within 7 days.",
      },
    },
    {
      id: "c4",
      title: "Stand-up Set — Delhi Live",
      creator: "Kabir Sethi",
      brief: "Punchline-first cuts, 20-40s max. Keep crowd reactions in.",
      platform: "Reels",
      payout: 190,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      niche: "Comedy",
      category: "Comedy",
      budget: 30000,
      spent: 0,
      daysLeft: 14,
      sourceLink: "https://drive.google.com/drive/folders/delhi-live",
      rules: "No profanity in captions. 20-40s clips. Add a hook in the first 3 seconds.",
      platforms: ["Reels", "Instagram", "TikTok"],
      verified: false,
      objective:
        "Turn the Delhi live set into viral punchline cuts that grow the comic's following.",
      startDate: isoDaysAgo(3),
      endDate: isoInDays(14),
      maxPayoutPerClip: 4000,
      recommendedDuration: "20–40s",
      hook: "Lead with the punchline, keep the crowd laugh.",
      captionReq: "No profanity in captions. Add #standup.",
      aspectRatio: "9:16 vertical",
      cta: "Follow Kabir Sethi for tour dates.",
      branding: "Keep 'Kabir Sethi' tag for 2s.",
      doList: [
        "Punchline-first edits",
        "Keep crowd reactions",
        "20–40s clips",
      ],
      dontList: [
        "No profanity in captions",
        "No long setups",
        "No other comic tags",
      ],
      sourceAssets: [
        { label: "Full set (Drive)", url: "https://drive.google.com/drive/folders/delhi-live" },
      ],
      exampleClips: [],
      viewRules: {
        verifiedView: "Unique view past 5s.",
        whenCounted: "Counted 48h after posting.",
        updateFrequency: "Every 24h.",
        minViews: 1000,
        maxPayout: 4000,
        deletedPolicy: "Deleted/private posts forfeit earnings.",
        payableWhen: "Payable 48h after approval.",
      },
      approval: {
        afterSubmission: "Ticket created under your profile.",
        reviewTime: "Within 48 hours.",
        criteria: "Funny, punchline-first, clean captions.",
        rejectionReasons: ["Profanity", "Too long", "No laugh"],
        appeal: "Help ticket within 5 days.",
      },
    },
  ],
  clips: [
      {
        id: "k1",
        campaignId: "c1",
        clipper: "maya.cuts",
        videoUrl: "https://instagram.com/reel/xk29a",
        caption: "This app is unhinged 🔥 #tech",
        status: "paid",
        views: 18400,
        submittedAt: Date.now() - 1000 * 60 * 60 * 20,
        platform: "Instagram",
      },
    {
      id: "k2",
      campaignId: "c1",
      clipper: "devon.edits",
      videoUrl: "https://youtube.com/shorts/8kd92",
      caption: "The keynote moment everyone missed",
      status: "pending",
      views: 0,
      submittedAt: Date.now() - 1000 * 60 * 60 * 3,
      platform: "YouTube",
    },
    {
      id: "k3",
      campaignId: "c2",
      clipper: "maya.cuts",
      videoUrl: "https://instagram.com/reel/pw001",
      caption: "3 moves that fixed my posture",
      status: "pending",
      views: 0,
      submittedAt: Date.now() - 1000 * 60 * 60 * 1,
      platform: "Instagram",
    },
    {
      id: "k4",
      campaignId: "c1",
      clipper: "maya.cuts",
      videoUrl: "https://instagram.com/reel/xk44b",
      caption: "The keynote but with a loud soundtrack",
      status: "rejected",
      views: 6200,
      submittedAt: Date.now() - 1000 * 60 * 60 * 40,
      platform: "Instagram",
      rejectionReason: "Campaign rule violation",
      rejectionDetails: "Background music was not allowed for this campaign.",
    },
    {
      id: "k5",
      campaignId: "c1",
      clipper: "maya.cuts",
      videoUrl: "https://instagram.com/reel/xk51p",
      caption: "3 quick takes from the keynote",
      status: "failed",
      views: 9100,
      submittedAt: Date.now() - 1000 * 60 * 60 * 30,
      platform: "Instagram",
      failureReason:
        "UPI verification failed — the UPI ID could not be verified. Update your payment method and retry.",
    },
  ],
  profiles: [],
  socialAccounts: [
    {
      id: "sa_ig",
      platform: "Instagram",
      handle: "@maya.cuts",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 40,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 6,
    },
    {
      id: "sa_yt",
      platform: "YouTube",
      handle: "@mayacuts",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 30,
    },
  ],
  siteSettings: {
    heroTitle: "",
    heroSubtitle: "",
    featuredIds: [],
    razorpayKey: "",
  },
};

interface StoreActions {
  addCampaign: (
    c: Omit<Campaign, "id" | "createdAt" | "status">,
    status?: CampaignStatus,
  ) => void;
  addClip: (k: Omit<Clip, "id" | "submittedAt" | "status" | "views">) => void;
  setClipStatus: (id: string, status: ClipStatus, patch?: Partial<Clip>) => void;
  closeCampaign: (id: string) => void;
  deleteCampaign: (id: string) => void;
  updateProfileStatus: (id: string, status: ProfileStatus) => void;
  deleteProfile: (id: string) => void;
  updateProfile: (id: string, patch: Partial<Pick<Profile, "name" | "upi">>) => void;
  addSocialAccount: (a: Omit<SocialAccount, "id" | "connectedAt" | "lastSyncAt"> & {
    connectedAt?: number;
    lastSyncAt?: number;
  }) => string;
  updateSocialAccount: (id: string, patch: Partial<SocialAccount>) => void;
  setSiteSettings: (s: SiteSettings) => void;
}

function mapCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    creator: String(r.creator ?? ""),
    brief: String(r.brief ?? ""),
    platform: (r.platform as Platform) ?? "Instagram",
    payout: Number(r.payout ?? 0),
    status: (r.status as CampaignStatus) ?? "open",
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    niche: r.niche ? String(r.niche) : undefined,
    budget: r.budget != null ? Number(r.budget) : undefined,
    spent: r.spent != null ? Number(r.spent) : undefined,
    daysLeft: r.days_left != null ? Number(r.days_left) : undefined,
    sourceLink: r.source_link ? String(r.source_link) : undefined,
    rules: r.rules ? String(r.rules) : undefined,
    created_by: r.created_by ? String(r.created_by) : undefined,
    category: r.category ? String(r.category) : undefined,
    platforms: Array.isArray(r.platforms) ? (r.platforms as Platform[]) : undefined,
    verified: r.verified != null ? Boolean(r.verified) : undefined,
    objective: r.objective ? String(r.objective) : undefined,
    startDate: r.start_date ? String(r.start_date) : undefined,
    endDate: r.end_date ? String(r.end_date) : undefined,
    maxPayoutPerClip: r.max_payout_per_clip != null ? Number(r.max_payout_per_clip) : undefined,
    recommendedDuration: r.recommended_duration ? String(r.recommended_duration) : undefined,
    hook: r.hook ? String(r.hook) : undefined,
    captionReq: r.caption_req ? String(r.caption_req) : undefined,
    aspectRatio: r.aspect_ratio ? String(r.aspect_ratio) : undefined,
    cta: r.cta ? String(r.cta) : undefined,
    branding: r.branding ? String(r.branding) : undefined,
    doList: Array.isArray(r.do_list) ? (r.do_list as string[]) : undefined,
    dontList: Array.isArray(r.dont_list) ? (r.dont_list as string[]) : undefined,
    sourceAssets: Array.isArray(r.source_assets)
      ? (r.source_assets as CampaignSourceAsset[])
      : undefined,
    exampleClips: Array.isArray(r.example_clips)
      ? (r.example_clips as CampaignExampleClip[])
      : undefined,
    viewRules:
      r.view_rules && typeof r.view_rules === "object"
        ? (r.view_rules as CampaignViewRules)
        : undefined,
    approval:
      r.approval && typeof r.approval === "object"
        ? (r.approval as CampaignApproval)
        : undefined,
    thumbnails: Array.isArray(r.thumbnails)
      ? (r.thumbnails as string[])
      : undefined,
    brandAssets: Array.isArray(r.brand_assets)
      ? (r.brand_assets as CampaignSourceAsset[])
      : undefined,
    spendCap: r.spend_cap != null ? Number(r.spend_cap) : undefined,
    timezone: r.timezone ? String(r.timezone) : undefined,
    whatToMake: r.what_to_make ? String(r.what_to_make) : undefined,
    style: r.style ? String(r.style) : undefined,
    rights:
      r.rights && typeof r.rights === "object"
        ? (r.rights as CampaignRights)
        : undefined,
  };
}

function mapSocialAccount(r: Record<string, unknown>): SocialAccount {
  return {
    id: String(r.id),
    userId: r.user_id ? String(r.user_id) : undefined,
    platform: (r.platform as Platform) ?? "Instagram",
    handle: String(r.handle ?? ""),
    status: (r.status as SocialAccountStatus) ?? "not_connected",
    verified: r.verified != null ? Boolean(r.verified) : false,
    connectedAt: r.connected_at ? new Date(String(r.connected_at)).getTime() : undefined,
    lastSyncAt: r.last_sync_at ? new Date(String(r.last_sync_at)).getTime() : undefined,
    error: r.error ? String(r.error) : undefined,
  };
}

function mapClip(r: Record<string, unknown>): Clip {
  return {
    id: String(r.id),
    campaignId: String(r.campaign_id),
    clipper: String(r.clipper ?? ""),
    videoUrl: String(r.video_url ?? ""),
    caption: String(r.caption ?? ""),
    status: (r.status as ClipStatus) ?? "pending",
    views: Number(r.views ?? 0),
    submittedAt: r.submitted_at ? new Date(String(r.submitted_at)).getTime() : Date.now(),
    platform: (r.platform as Platform) ?? "Instagram",
    userId: r.user_id ? String(r.user_id) : undefined,
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : undefined,
    rejectionDetails: r.rejection_details ? String(r.rejection_details) : undefined,
    failureReason: r.failure_reason ? String(r.failure_reason) : undefined,
  };
}

function mapProfile(r: Record<string, unknown>): Profile {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    role: (r.role as ProfileRole) ?? "clipper",
    status: (r.status as ProfileStatus) ?? "active",
    upi: r.upi ? String(r.upi) : undefined,
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
  };
}

function mapSiteSettings(r: Record<string, unknown> | null): SiteSettings {
  if (!r) {
    return { heroTitle: "", heroSubtitle: "", featuredIds: [], razorpayKey: "" };
  }
  const fids = r.featured_ids;
  return {
    heroTitle: r.hero_title ? String(r.hero_title) : "",
    heroSubtitle: r.hero_subtitle ? String(r.hero_subtitle) : "",
    featuredIds: Array.isArray(fids) ? (fids as unknown[]).map(String) : [],
    razorpayKey: r.razorpay_key ? String(r.razorpay_key) : "",
  };
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);

function ignore(p: PromiseLike<unknown>) {
  Promise.resolve(p).catch(() => {});
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(seed);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    (async () => {
      const [
        { data: camps },
        { data: clps },
        { data: profs },
        { data: accts },
        { data: site },
      ] = await Promise.all([
        supabase.from("campaigns").select("*"),
        supabase.from("clips").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("social_accounts").select("*"),
        supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
      ]);
      if (!active) return;
      if (camps) setState((s) => ({ ...s, campaigns: camps.map(mapCampaign) }));
      if (clps) setState((s) => ({ ...s, clips: clps.map(mapClip) }));
      if (profs) setState((s) => ({ ...s, profiles: profs.map(mapProfile) }));
      if (accts)
        setState((s) => ({
          ...s,
          socialAccounts: accts.map(mapSocialAccount),
        }));
      if (site)
        setState((s) => ({ ...s, siteSettings: mapSiteSettings(site as Record<string, unknown>) }));
    })().catch(() => {
      /* keep seed on failure */
    });

    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo<StoreActions>(
    () => ({
      addCampaign: (c, status = "open") => {
        const optimistic: Campaign = {
          ...c,
          id: `c${Date.now()}`,
          createdAt: Date.now(),
          status,
        };
        setState((s) => ({ ...s, campaigns: [optimistic, ...s.campaigns] }));

        if (!isSupabaseConfigured) return;
        (async () => {
          const { data: u } = await supabase.auth.getUser();
          const handle =
            (u.user?.user_metadata?.name as string) ||
            u.user?.email ||
            c.creator;
          const { data } = await supabase
            .from("campaigns")
            .insert({
              title: c.title,
              creator: handle,
              brief: c.brief,
              platform: c.platform,
              payout: c.payout,
              niche: c.niche ?? null,
              budget: c.budget ?? 0,
              spent: 0,
              days_left: c.daysLeft ?? 30,
              status,
              source_link: c.sourceLink ?? null,
              rules: c.rules ?? null,
              created_by: u.user?.id ?? null,
              category: c.category ?? null,
              platforms: c.platforms ?? null,
              verified: c.verified ?? null,
              objective: c.objective ?? null,
              start_date: c.startDate ?? null,
              end_date: c.endDate ?? null,
              max_payout_per_clip: c.maxPayoutPerClip ?? null,
              recommended_duration: c.recommendedDuration ?? null,
              hook: c.hook ?? null,
              caption_req: c.captionReq ?? null,
              aspect_ratio: c.aspectRatio ?? null,
              cta: c.cta ?? null,
              branding: c.branding ?? null,
              do_list: c.doList ?? null,
              dont_list: c.dontList ?? null,
              source_assets: c.sourceAssets ?? null,
              example_clips: c.exampleClips ?? null,
              view_rules: c.viewRules ?? null,
              approval: c.approval ?? null,
              thumbnails: c.thumbnails ?? null,
              brand_assets: c.brandAssets ?? null,
              spend_cap: c.spendCap ?? null,
              timezone: c.timezone ?? null,
              what_to_make: c.whatToMake ?? null,
              style: c.style ?? null,
              rights: c.rights ?? null,
            })
            .select()
            .single();
          if (data) {
            setState((s) => ({
              ...s,
              campaigns: [
                mapCampaign(data as Record<string, unknown>),
                ...s.campaigns.filter((x) => x.id !== optimistic.id),
              ],
            }));
          }
        })().catch(() => {});
      },

      addClip: (k) => {
        const optimistic: Clip = {
          ...k,
          id: `k${Date.now()}`,
          submittedAt: Date.now(),
          status: "pending",
          views: 0,
        };
        setState((s) => ({ ...s, clips: [optimistic, ...s.clips] }));

        if (!isSupabaseConfigured) return;
        (async () => {
          const { data: u } = await supabase.auth.getUser();
          const handle =
            (u.user?.user_metadata?.name as string) ||
            u.user?.email ||
            k.clipper;
          const { data } = await supabase
            .from("clips")
            .insert({
              campaign_id: k.campaignId,
              clipper: handle,
              caption: k.caption,
              video_url: k.videoUrl,
              platform: k.platform ?? "Instagram",
              user_id: u.user?.id ?? null,
            })
            .select()
            .single();
          if (data) {
            setState((s) => ({
              ...s,
              clips: [
                mapClip(data as Record<string, unknown>),
                ...s.clips.filter((x) => x.id !== optimistic.id),
              ],
            }));
          }
        })().catch(() => {});
      },

      setClipStatus: (id, status, patch) => {
        setState((s) => ({
          ...s,
          clips: s.clips.map((k) =>
            k.id === id ? { ...k, status, ...patch } : k,
          ),
        }));
        if (!isSupabaseConfigured) return;
        const update: Record<string, unknown> = { status };
        if (patch?.rejectionReason !== undefined)
          update.rejection_reason = patch.rejectionReason;
        if (patch?.rejectionDetails !== undefined)
          update.rejection_details = patch.rejectionDetails;
        ignore(supabase.from("clips").update(update).eq("id", id));
      },

      closeCampaign: (id) => {
        setState((s) => ({
          ...s,
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, status: "closed" } : c,
          ),
        }));
        if (!isSupabaseConfigured) return;
        ignore(
          supabase.from("campaigns").update({ status: "closed" }).eq("id", id),
        );
      },

      deleteCampaign: (id) => {
        setState((s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("campaigns").delete().eq("id", id));
      },

      updateProfileStatus: (id, status) => {
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, status } : p)),
        }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("profiles").update({ status }).eq("id", id));
      },

      deleteProfile: (id) => {
        setState((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("profiles").delete().eq("id", id));
      },

      updateProfile: (id, patch) => {
        setState((s) => {
          const exists = s.profiles.some((p) => p.id === id);
          if (exists) {
            return {
              ...s,
              profiles: s.profiles.map((p) =>
                p.id === id ? { ...p, ...patch } : p,
              ),
            };
          }
          const created: Profile = {
            id,
            email: "",
            role: "clipper",
            status: "active",
            createdAt: Date.now(),
            ...patch,
            name: patch.name ?? "",
          };
          return { ...s, profiles: [...s.profiles, created] };
        });
        if (!isSupabaseConfigured) return;
        ignore(
          supabase
            .from("profiles")
            .update({ name: patch.name, upi: patch.upi })
            .eq("id", id),
        );
      },

      addSocialAccount: (a) => {
        const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const record: SocialAccount = {
          id,
          userId: a.userId,
          platform: a.platform,
          handle: a.handle,
          status: a.status,
          verified: a.verified,
          connectedAt: a.connectedAt,
          lastSyncAt: a.lastSyncAt,
          error: a.error,
        };
        setState((s) => ({ ...s, socialAccounts: [...s.socialAccounts, record] }));
        if (!isSupabaseConfigured) return id;
        ignore(
          supabase.from("social_accounts").insert({
            id,
            user_id: a.userId,
            platform: a.platform,
            handle: a.handle,
            status: a.status,
            verified: a.verified,
            connected_at: a.connectedAt
              ? new Date(a.connectedAt).toISOString()
              : null,
            last_sync_at: a.lastSyncAt
              ? new Date(a.lastSyncAt).toISOString()
              : null,
            error: a.error,
          }),
        );
        return id;
      },

      updateSocialAccount: (id, patch) => {
        setState((s) => ({
          ...s,
          socialAccounts: s.socialAccounts.map((acc) =>
            acc.id === id ? { ...acc, ...patch } : acc,
          ),
        }));
        if (!isSupabaseConfigured) return;
        const payload: Record<string, unknown> = {};
        if (patch.handle !== undefined) payload.handle = patch.handle;
        if (patch.status !== undefined) payload.status = patch.status;
        if (patch.verified !== undefined) payload.verified = patch.verified;
        if (patch.error !== undefined) payload.error = patch.error;
        if (patch.connectedAt !== undefined)
          payload.connected_at = patch.connectedAt
            ? new Date(patch.connectedAt).toISOString()
            : null;
        if (patch.lastSyncAt !== undefined)
          payload.last_sync_at = patch.lastSyncAt
            ? new Date(patch.lastSyncAt).toISOString()
            : null;
        ignore(
          supabase.from("social_accounts").update(payload).eq("id", id),
        );
      },

      setSiteSettings: (site) => {
        setState((s) => ({ ...s, siteSettings: site }));
        if (!isSupabaseConfigured) return;
        ignore(
          supabase
            .from("site_settings")
            .upsert({
              id: 1,
              hero_title: site.heroTitle,
              hero_subtitle: site.heroSubtitle,
              featured_ids: site.featuredIds,
              razorpay_key: site.razorpayKey,
            }),
        );
      },
    }),
    [],
  );

  const value = { ...state, ...actions };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
