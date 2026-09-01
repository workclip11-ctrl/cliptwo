"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  ClipEngagement,
  AuditEntry,
  Platform,
  Profile,
  ProfileRole,
  Appeal,
  TeamMember,
  ProfileStatus,
  RiskFlag,
  SocialAccount,
  SocialAccountStatus,
  SiteSettings,
  StoreState,
} from "./types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { EARNED_STATUSES, isEarned, financeOf, campaignBudget, wouldExceedBudget, canAcceptSubmission } from "@/lib/finance";
import { clipEarnings } from "@/lib/format";
import { appendAuditLog, initAuditLogs } from "@/lib/audit";

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const isoInDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const seed: StoreState = {
  campaigns: [
    {
      id: "c1",
      title: "Launch teaser for our new app",
      creator: "Northwind Labs",
      created_by: "u_northwind",
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
      platforms: ["Instagram", "YouTube"],
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
      created_by: "u_fitform",
      brief: "Turn the 12-min session into 3 separate 30s reels. Vertical only.",
      platform: "Instagram",
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
      platforms: ["Instagram"],
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
      created_by: "u_maker",
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
      platforms: ["YouTube", "Instagram"],
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
      created_by: "u_kabir",
      brief: "Punchline-first cuts, 20-40s max. Keep crowd reactions in.",
      platform: "Instagram",
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
      platforms: ["Instagram"],
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
      payoutDate: Date.now() - 1000 * 60 * 60 * 10,
      engagement: { likes: 2100, comments: 142, shares: 380 },
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 20 },
          { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 18 },
          { action: "payable", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 17 },
          { action: "processing", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 12 },
          { action: "paid", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 10, note: "Released to UPI" },
        ],
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
        audit: [
          { action: "submitted", by: "devon.edits", at: Date.now() - 1000 * 60 * 60 * 3 },
        ],
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
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 1 },
        ],
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
        engagement: { likes: 240, comments: 18, shares: 12 },
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 40 },
          {
            action: "rejected",
            by: "workclip11@gmail.com",
            at: Date.now() - 1000 * 60 * 60 * 38,
            note: "Campaign rule violation — Background music was not allowed for this campaign.",
          },
        ],
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
        engagement: { likes: 510, comments: 33, shares: 44 },
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 30 },
          { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 28 },
          { action: "payable", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 27 },
          {
            action: "failed",
            by: "workclip11@gmail.com",
            at: Date.now() - 1000 * 60 * 60 * 26,
          note: "UPI verification failed — the UPI ID could not be verified. Update your payment method and retry.",
        },
      ],
    },
    {
      id: "kp1",
      campaignId: "c1",
      clipper: "priya.viral",
      videoUrl: "https://instagram.com/reel/priya01",
      caption: "This app actually fixed my screen-time 😭",
      status: "approved",
      views: 52000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 9,
      platform: "Instagram",
      engagement: { likes: 6200, comments: 410, shares: 980 },
      audit: [
        { action: "submitted", by: "priya.viral", at: Date.now() - 1000 * 60 * 60 * 24 * 9 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 8 },
      ],
    },
    {
      id: "kp2",
      campaignId: "c1",
      clipper: "priya.viral",
      videoUrl: "https://instagram.com/reel/priya02",
      caption: "3 features you missed",
      status: "approved",
      views: 31000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      platform: "Instagram",
      engagement: { likes: 3300, comments: 220, shares: 510 },
      audit: [
        { action: "submitted", by: "priya.viral", at: Date.now() - 1000 * 60 * 60 * 24 * 6 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 5 },
      ],
    },
    {
      id: "kp3",
      campaignId: "c1",
      clipper: "priya.viral",
      videoUrl: "https://youtube.com/shorts/priya03",
      caption: "The aha moment",
      status: "payable",
      views: 12000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      platform: "YouTube",
      engagement: { likes: 1200, comments: 90, shares: 140 },
      audit: [
        { action: "submitted", by: "priya.viral", at: Date.now() - 1000 * 60 * 60 * 24 * 3 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 2 },
        { action: "payable", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 1 },
      ],
    },
    {
      id: "kar1",
      campaignId: "c2",
      clipper: "arjun.cuts",
      videoUrl: "https://instagram.com/reel/arjun01",
      caption: "Posture fix in 30s",
      status: "approved",
      views: 18000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
      platform: "Instagram",
      engagement: { likes: 2100, comments: 130, shares: 260 },
      audit: [
        { action: "submitted", by: "arjun.cuts", at: Date.now() - 1000 * 60 * 60 * 24 * 4 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 3 },
      ],
    },
    {
      id: "kr1",
      campaignId: "c1",
      clipper: "rahul.bot",
      videoUrl: "https://instagram.com/reel/xyz789",
      caption: "Viral hack!!",
      status: "rejected",
      views: 88000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      platform: "Instagram",
      rejectionReason: "Fake engagement",
      rejectionDetails: "Retention curve is non-human; views inconsistent with watch-time. Suspected bot traffic.",
      engagement: { likes: 40, comments: 3, shares: 5 },
      audit: [
        { action: "submitted", by: "rahul.bot", at: Date.now() - 1000 * 60 * 60 * 24 * 6 },
        {
          action: "rejected",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 5,
          note: "Fake engagement — retention curve is non-human; suspected bot traffic.",
        },
      ],
    },
    {
      id: "kr2",
      campaignId: "c1",
      clipper: "rahul.bot",
      videoUrl: "https://instagram.com/reel/abc456",
      caption: "Another one",
      status: "approved",
      views: 2400,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      platform: "Instagram",
      engagement: { likes: 60, comments: 4, shares: 8 },
      audit: [
        { action: "submitted", by: "rahul.bot", at: Date.now() - 1000 * 60 * 60 * 24 * 2 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 1 },
      ],
    },
    {
      id: "kb1",
      campaignId: "c1",
      clipper: "banned.user",
      videoUrl: "https://instagram.com/reel/spam01",
      caption: "Buy followers",
      status: "rejected",
      views: 60000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
      platform: "Instagram",
      rejectionReason: "View fraud",
      rejectionDetails: "Views traced to incentivised/fake sources.",
      engagement: { likes: 10, comments: 0, shares: 1 },
      audit: [
        { action: "submitted", by: "banned.user", at: Date.now() - 1000 * 60 * 60 * 24 * 8 },
        {
          action: "rejected",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 7,
          note: "View fraud — views traced to incentivised/fake sources.",
        },
      ],
    },
    {
      id: "kb2",
      campaignId: "c1",
      clipper: "banned.user",
      videoUrl: "https://youtube.com/shorts/spam02",
      caption: "Spam reel",
      status: "failed",
      views: 3000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      platform: "YouTube",
      failureReason: "Account suspended before payout.",
      engagement: { likes: 20, comments: 1, shares: 2 },
      audit: [
        { action: "submitted", by: "banned.user", at: Date.now() - 1000 * 60 * 60 * 24 * 6 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 5 },
        {
          action: "failed",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 4,
          note: "Account suspended before payout.",
        },
      ],
    },
    {
      id: "ksb1",
      campaignId: "c2",
      clipper: "simran.m",
      videoUrl: "https://instagram.com/reel/simran01",
      caption: "My first cut",
      status: "pending",
      views: 0,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
      platform: "Instagram",
      audit: [
        { action: "submitted", by: "simran.m", at: Date.now() - 1000 * 60 * 60 * 24 * 1 },
      ],
    },
    {
      id: "kl1",
      campaignId: "c1",
      clipper: "leo.edits",
      videoUrl: "https://instagram.com/reel/leo01",
      caption: "Smooth transition edit",
      status: "approved",
      views: 9000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      platform: "Instagram",
      engagement: { likes: 800, comments: 50, shares: 120 },
      audit: [
        { action: "submitted", by: "leo.edits", at: Date.now() - 1000 * 60 * 60 * 24 * 5 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 4 },
      ],
    },
    {
      id: "kl2",
      campaignId: "c1",
      clipper: "leo.edits",
      videoUrl: "https://instagram.com/reel/leo02",
      caption: "Off-brief try",
      status: "rejected",
      views: 2000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      platform: "Instagram",
      rejectionReason: "Off-brief",
      rejectionDetails: "Used horizontal footage against the brief.",
      engagement: { likes: 90, comments: 6, shares: 10 },
      audit: [
        { action: "submitted", by: "leo.edits", at: Date.now() - 1000 * 60 * 60 * 24 * 3 },
        {
          action: "rejected",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 2,
          note: "Off-brief — used horizontal footage against the brief.",
        },
      ],
    },
    {
      id: "kc3a",
      campaignId: "c3",
      clipper: "priya.viral",
      videoUrl: "https://instagram.com/reel/maker01",
      caption: "Maker House — assembly reel",
      status: "approved",
      views: 21000,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
      platform: "Instagram",
      engagement: { likes: 1200, comments: 80, shares: 140 },
      audit: [
        { action: "submitted", by: "priya.viral", at: Date.now() - 1000 * 60 * 60 * 24 * 4 },
        {
          action: "approved",
          by: "kabir@makerhouse.app",
          at: Date.now() - 1000 * 60 * 60 * 24 * 3,
        },
      ],
    },
    {
      id: "kc3b",
      campaignId: "c3",
      clipper: "maya.cuts",
      videoUrl: "https://youtube.com/shorts/maker02",
      caption: "Maker House — top 5 tools",
      status: "payable",
      views: 13500,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      platform: "YouTube",
      engagement: { likes: 640, comments: 42, shares: 55 },
      audit: [
        { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 24 * 2 },
      ],
    },
    {
      id: "kc4a",
      campaignId: "c4",
      clipper: "devon.edits",
      videoUrl: "https://instagram.com/reel/kabir01",
      caption: "Stand-up — Delhi Live highlight",
      status: "approved",
      views: 9200,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
      platform: "Instagram",
      engagement: { likes: 510, comments: 33, shares: 48 },
      audit: [
        { action: "submitted", by: "devon.edits", at: Date.now() - 1000 * 60 * 60 * 24 * 1 },
        {
          action: "approved",
          by: "kabir@standup.app",
          at: Date.now() - 1000 * 60 * 60 * 24 * 1 + 1000 * 60 * 60 * 3,
        },
      ],
    },
    {
      id: "kh1",
      campaignId: "c1",
      clipper: "simran.k",
      videoUrl: "https://instagram.com/reel/hold01",
      caption: "Teaser with unlicensed audio",
      status: "held",
      views: 7600,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      platform: "Instagram",
      heldReason: "Possible copyright claim on background audio — under review.",
      engagement: { likes: 300, comments: 18, shares: 22 },
      audit: [
        { action: "submitted", by: "simran.k", at: Date.now() - 1000 * 60 * 60 * 24 * 6 },
        {
          action: "approved",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 5,
        },
        {
          action: "held",
          by: "workclip11@gmail.com",
          at: Date.now() - 1000 * 60 * 60 * 24 * 4,
          note: "Possible copyright claim on background audio — under review.",
        },
      ],
    },
  ],
  profiles: [
    {
      id: "u_maya",
      name: "Maya Reddy",
      username: "maya.cuts",
      email: "maya@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 45,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 50,
      upi: "maya.reddy@okaxis",
    },
    {
      id: "u_devon",
      name: "Devon Pereira",
      username: "devon.edits",
      email: "devon@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20,
    },
    {
      id: "u_priya",
      name: "Priya Nair",
      username: "priya.viral",
      email: "priya@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 75,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 80,
      upi: "priya.nair@okhdfc",
    },
    {
      id: "u_arjun",
      name: "Arjun Mehta",
      username: "arjun.cuts",
      email: "arjun@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 55,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
    },
    {
      id: "u_rahul",
      name: "Rahul Verma",
      username: "rahul.bot",
      email: "rahul@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 15,
      riskFlag: true,
      riskNote: "Multiple clips show abnormal retention (bot-like traffic) and one was rejected for fake engagement.",
      appeals: [
        {
          id: "ap_1",
          clipId: "kr1",
          campaignId: "c1",
          reason: "My views are real — my account just grew fast. Please reconsider the rejection.",
          status: "open",
          at: Date.now() - 1000 * 60 * 60 * 24 * 2,
        },
      ],
    },
    {
      id: "u_banned",
      name: "Spam Account",
      username: "banned.user",
      email: "spam@cliptwo.app",
      role: "clipper",
      status: "suspended",
      suspendedReason: "Confirmed view fraud across two campaigns.",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
      riskFlag: true,
      riskNote: "Permanently flagged for fraudulent views.",
    },
    {
      id: "u_simran",
      name: "Simran Kaur",
      username: "simran.m",
      email: "simran@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    },
    {
      id: "u_leo",
      name: "Leo D'Souza",
      username: "leo.edits",
      email: "leo@cliptwo.app",
      role: "clipper",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 35,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 40,
    },
    {
      id: "u_northwind",
      name: "Aarav Shah",
      company: "Northwind Labs",
      username: "northwind",
      email: "aarav@northwind.app",
      role: "creator",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 80,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 90,
      upi: "northwind@okaxis",
      team: [
        { name: "Aarav Shah", role: "Owner" },
        { name: "Neha Gupta", email: "neha@northwind.app", role: "Marketing" },
        { name: "Rohan Iyer", email: "rohan@northwind.app", role: "Editor" },
      ],
    },
    {
      id: "u_fitform",
      name: "Meera Nair",
      company: "FitForm",
      username: "fitform",
      email: "meera@fitform.app",
      role: "creator",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 70,
      upi: "fitform@okhdfc",
    },
    {
      id: "u_maker",
      name: "Kabir Mehta",
      company: "Maker House",
      username: "makerhouse",
      email: "kabir@makerhouse.app",
      role: "creator",
      status: "active",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 50,
      adminNotes: "Awaiting brand verification documents before marking verified.",
    },
    {
      id: "u_kabir",
      name: "Kabir Sethi",
      company: "Kabir Sethi",
      username: "kabirsethi",
      email: "kabir@standup.app",
      role: "creator",
      status: "active",
      verified: true,
      verifiedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 22,
    },
    {
      id: "u_demobrand",
      name: "Demo Brand",
      company: "Demo Co",
      username: "democo",
      email: "demo@brand.app",
      role: "creator",
      status: "suspended",
      suspendedReason: "Repeated campaign rule violations.",
      verified: false,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
    },
  ],
  socialAccounts: [
    {
      id: "sa_ig",
      userId: "u_maya",
      platform: "Instagram",
      handle: "@maya.cuts",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 40,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
    },
    {
      id: "sa_yt",
      userId: "u_maya",
      platform: "YouTube",
      handle: "@mayacuts",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    },
    {
      id: "sa_priya_tt",
      userId: "u_priya",
      platform: "Instagram",
      handle: "@priyaviral",
      status: "verified",
      verified: true,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 70,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
    },
    {
      id: "sa_arjun_ig",
      userId: "u_arjun",
      platform: "Instagram",
      handle: "@arjun.cuts",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 50,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    },
    {
      id: "sa_rahul_yt",
      userId: "u_rahul",
      platform: "YouTube",
      handle: "@rahulbot",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 14,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 9,
    },
    {
      id: "sa_leo_ig",
      userId: "u_leo",
      platform: "Instagram",
      handle: "@leo.edits",
      status: "connected",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 38,
      lastSyncAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    },
    {
      id: "sa_simran_re",
      userId: "u_simran",
      platform: "Instagram",
      handle: "@simran.m",
      status: "connecting",
      verified: false,
      connectedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    },
  ],
  siteSettings: {
    heroTitle: "",
    heroSubtitle: "",
    featuredIds: [],
    razorpayKey: "",
  },
  savedCampaigns: [],
};

interface StoreActions {
  addCampaign: (
    c: Omit<Campaign, "id" | "createdAt" | "status">,
    status?: CampaignStatus,
  ) => void;
  addClip: (k: Omit<Clip, "id" | "submittedAt" | "status" | "views">) => void;
  setClipStatus: (
    id: string,
    status: ClipStatus,
    patch?: Partial<Clip>,
    actor?: string,
  ) => void;
  closeCampaign: (id: string) => void;
  deleteCampaign: (id: string) => void;
  updateCampaign: (
    id: string,
    patch: Partial<Campaign>,
    actor?: string,
    action?: string,
    note?: string,
  ) => void;
  updateProfileStatus: (
    id: string,
    status: ProfileStatus,
    actor?: string,
    reason?: string,
  ) => void;
  deleteProfile: (id: string) => Promise<void>;
  verifyProfile: (id: string, actor: string, verified: boolean) => void;
  setProfileRisk: (id: string, actor: string, flagged: boolean, note?: string) => void;
  saveAdminNotes: (id: string, notes: string, actor: string) => void;
  respondToAppeal: (
    id: string,
    appealId: string,
    response: string,
    status: "reviewing" | "approved" | "rejected",
    actor: string,
  ) => void;
  updateProfile: (id: string, patch: Partial<Pick<Profile, "name" | "upi" | "bio">>) => void;
  addSocialAccount: (a: Omit<SocialAccount, "id" | "connectedAt" | "lastSyncAt"> & {
    connectedAt?: number;
    lastSyncAt?: number;
  }) => string;
  updateSocialAccount: (id: string, patch: Partial<SocialAccount>) => void;
  setSiteSettings: (s: SiteSettings) => void;
  toggleSaveCampaign: (id: string) => void;
}

// Maps Campaign model keys to DB columns for `updateCampaign`. Only keys
// present in the patch are written, so partial edits never clobber fields.
const CAMPAIGN_DB_MAP: Record<string, string> = {
  title: "title",
  brief: "brief",
  platform: "platform",
  payout: "payout",
  niche: "niche",
  budget: "budget",
  spent: "spent",
  daysLeft: "days_left",
  sourceLink: "source_link",
  rules: "rules",
  category: "category",
  platforms: "platforms",
  verified: "verified",
  objective: "objective",
  startDate: "start_date",
  endDate: "end_date",
  maxPayoutPerClip: "max_payout_per_clip",
  recommendedDuration: "recommended_duration",
  hook: "hook",
  captionReq: "caption_req",
  aspectRatio: "aspect_ratio",
  cta: "cta",
  branding: "branding",
  viewRules: "view_rules",
  approval: "approval",
  thumbnails: "thumbnails",
  brandAssets: "brand_assets",
  spendCap: "spend_cap",
  timezone: "timezone",
  whatToMake: "what_to_make",
  style: "style",
  rights: "rights",
  status: "status",
};

// Maps Profile model keys to DB columns for admin updates. Only keys present
// in the patch are written, so partial edits never clobber fields.
const PROFILE_DB_MAP: Record<string, string> = {
  name: "name",
  username: "username",
  email: "email",
  role: "role",
  status: "status",
  verified: "verified",
  verifiedAt: "verified_at",
  upi: "upi",
  company: "company",
  team: "team",
  riskFlag: "risk_flag",
  riskNote: "risk_note",
  adminNotes: "admin_notes",
  suspendedReason: "suspended_reason",
  appeals: "appeals",
  audit: "audit",
};

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
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : undefined,
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
    heldReason: r.held_reason ? String(r.held_reason) : undefined,
    txnId: r.txn_id ? String(r.txn_id) : undefined,
    payoutRef: r.payout_ref ? String(r.payout_ref) : undefined,
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).getTime() : undefined,
    payoutDate: r.payout_date ? new Date(String(r.payout_date)).getTime() : undefined,
    engagement: (r.engagement as ClipEngagement) ?? undefined,
    audit: Array.isArray(r.audit)
      ? (r.audit as AuditEntry[])
      : undefined,
    riskFlags: Array.isArray(r.risk_flags) ? (r.risk_flags as RiskFlag[]) : undefined,
  };
}

function mapProfile(r: Record<string, unknown>): Profile {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    username: r.username ? String(r.username) : undefined,
    email: String(r.email ?? ""),
    role: (r.role as ProfileRole) ?? "clipper",
    status: (r.status as ProfileStatus) ?? "active",
    verified: r.verified != null ? Boolean(r.verified) : undefined,
    verifiedAt: r.verified_at ? new Date(String(r.verified_at)).getTime() : undefined,
    upi: r.upi ? String(r.upi) : undefined,
    company: r.company ? String(r.company) : undefined,
    team: Array.isArray(r.team) ? (r.team as TeamMember[]) : undefined,
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    riskFlag: r.risk_flag != null ? Boolean(r.risk_flag) : undefined,
    riskNote: r.risk_note ? String(r.risk_note) : undefined,
    adminNotes: r.admin_notes ? String(r.admin_notes) : undefined,
    suspendedReason: r.suspended_reason ? String(r.suspended_reason) : undefined,
    appeals: Array.isArray(r.appeals) ? (r.appeals as Appeal[]) : undefined,
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : undefined,
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

const LOCAL_STORAGE_KEY = "cliptwo_local_state";

function loadLocalState(): Partial<StoreState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<StoreState>;
  } catch {
    return null;
  }
}

function saveLocalState(state: StoreState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        campaigns: state.campaigns,
        clips: state.clips,
        profiles: state.profiles,
        socialAccounts: state.socialAccounts,
      }),
    );
  } catch {
    /* quota exceeded or SSR */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(seed);
  const stateRef = useRef(state);
  const loadedRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  });

  // Persist to localStorage in local mode
  useEffect(() => {
    if (!isSupabaseConfigured) saveLocalState(state);
  }, [state]);

  // Load saved state from localStorage on client mount (after hydration)
  useEffect(() => {
    if (isSupabaseConfigured || loadedRef.current) return;
    loadedRef.current = true;
    const saved = loadLocalState();
    if (saved) {
      setState((s) => ({ ...s, ...saved }));
    }
  }, []);

  // Initialize audit log store from localStorage on mount
  useEffect(() => {
    initAuditLogs();
  }, []);

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

  // Audit log: track clip status changes
  const prevClipsRef = useRef(state.clips);
  useEffect(() => {
    const prev = prevClipsRef.current;
    const curr = state.clips;
    for (const clip of curr) {
      const old = prev.find((c) => c.id === clip.id);
      if (old && old.status !== clip.status) {
        const camp = state.campaigns.find((c) => c.id === clip.campaignId);
        const label = camp?.title ?? clip.campaignId;
        const base = { actor: "admin", targetType: "clip" as const, targetId: clip.id, targetLabel: label };
        if (clip.status === "approved") appendAuditLog({ ...base, action: "clip_approved", newValue: clip.status, reason: clip.rejectionReason ?? clip.failureReason ?? clip.heldReason });
        else if (clip.status === "rejected") appendAuditLog({ ...base, action: "clip_rejected", newValue: clip.status, reason: clip.rejectionReason });
        else if (clip.status === "held") appendAuditLog({ ...base, action: "clip_held", newValue: clip.status, reason: clip.heldReason });
        else if (clip.status === "processing") appendAuditLog({ ...base, action: "payout_initiated" });
        else if (clip.status === "paid") appendAuditLog({ ...base, action: "payout_completed" });
        else if (clip.status === "failed") appendAuditLog({ ...base, action: "payout_failed", reason: clip.failureReason });
      }
    }
    prevClipsRef.current = curr;
  });

  const actions = useMemo<StoreActions>(() => {
    // ── Auth helpers for ownership checks ──
    async function getCurrentUser() {
      if (!isSupabaseConfigured) return null;
      try {
        const { data } = await supabase.auth.getUser();
        return data.user;
      } catch {
        return null;
      }
    }

    function isUserAdmin(user: { user_metadata?: Record<string, unknown> } | null) {
      if (!user) return false;
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      return meta.role === "admin";
    }

    // Core admin profile patcher: merges a partial profile update, appends an
    // audit entry, and persists both to Supabase. New profile actions are thin
    // wrappers around this so every change is audited consistently.
    const adminProfilePatch = async (
      id: string,
      patch: Partial<Profile>,
      actor?: string,
      action?: string,
      note?: string,
    ) => {
      // SECURITY: Only admins can use adminProfilePatch.
      const me = await getCurrentUser();
      if (!isUserAdmin(me)) {
        console.error(`Authorization: non-admin user cannot admin-patch profile ${id}`);
        return;
      }
      setState((s) => {
        const entry: AuditEntry = { action: action ?? "updated", by: actor, at: Date.now(), note };
        return {
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, ...patch, audit: [...(p.audit ?? []), entry] } : p,
          ),
        };
      });
      if (!isSupabaseConfigured) return;
      // Profile field keys that map to timestamptz columns must be sent as ISO
      // strings, not raw epoch numbers, or Postgres rejects the input.
      const DATE_KEYS = new Set(["verifiedAt"]);
      const update: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        const col = PROFILE_DB_MAP[k];
        if (!col) continue;
        if (v === undefined) {
          update[col] = null;
        } else if (DATE_KEYS.has(k) && typeof v === "number") {
          update[col] = new Date(v).toISOString();
        } else {
          update[col] = v as unknown;
        }
      }
      const existing = stateRef.current.profiles.find((p) => p.id === id);
      update.audit = [
        ...(existing?.audit ?? []),
        { action: action ?? "updated", by: actor, at: Date.now(), note },
      ];
      ignore(supabase.from("profiles").update(update).eq("id", id));
    };

    return {
      addCampaign: (c, status = "open") => {
        const optimistic: Campaign = {
          ...c,
          id: `c${Date.now()}`,
          createdAt: Date.now(),
          status,
          created_by: c.created_by ?? stateRef.current.profiles.find((p) => p.id === c.created_by)?.id,
        };
        setState((s) => ({ ...s, campaigns: [optimistic, ...s.campaigns] }));
        appendAuditLog({
          actor: c.creator ?? "creator",
          action: "campaign_created",
          targetType: "campaign",
          targetId: optimistic.id,
          targetLabel: c.title,
          newValue: status,
        });

        if (!isSupabaseConfigured) return;
        (async () => {
          const { data: u } = await supabase.auth.getUser();
          const handle =
            (u?.user?.user_metadata?.name as string) ||
            u?.user?.email ||
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
              created_by: u?.user?.id ?? null,
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
        // --- Server-side budget enforcement for new submissions ---
        // Prevent new submissions when campaign is closed, paused, or at budget.
        const cur = stateRef.current;
        const camp = cur.campaigns.find((c) => c.id === k.campaignId);
        if (camp) {
          if (camp.status !== "open") {
            console.error(
              `Budget protection: rejecting submission for campaign "${camp.title}". ` +
                `Campaign status is "${camp.status}".`,
            );
            return;
          }
          if (!canAcceptSubmission(camp, cur.clips)) {
            console.error(
              `Budget protection: rejecting submission for campaign "${camp.title}". ` +
                `Campaign has reached its budget.`,
            );
            return;
          }
        }

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

       setClipStatus: async (id, status, patch, actor) => {
          // SECURITY: Only admins can change clip status. Creators cannot approve/reject.
          const me = await getCurrentUser();
          if (!isUserAdmin(me)) {
            console.error(`Authorization: non-admin user cannot change clip status for ${id}`);
            return;
          }
          // --- Server-side budget enforcement ---
          // When transitioning to an earned status, verify the campaign budget
          // will not be exceeded. This is the authoritative guard; frontend
          // checks are convenience only.
          const isTransitioningToEarned = EARNED_STATUSES.includes(status);
          if (isTransitioningToEarned) {
            const cur = stateRef.current;
            const clip = cur.clips.find((k) => k.id === id);
            if (clip) {
              const camp = cur.campaigns.find((c) => c.id === clip.campaignId);
              if (camp) {
                const clipAlreadyEarned = EARNED_STATUSES.includes(clip.status);
                if (!clipAlreadyEarned) {
                  const additionalEarnings = clipEarnings(
                    { ...clip, status } as Clip,
                    cur.campaigns,
                  );
                  if (wouldExceedBudget(camp, cur.clips, additionalEarnings)) {
                    const b = campaignBudget(camp, cur.clips);
                    console.error(
                      `Budget protection: rejecting status change for clip ${id}. ` +
                        `Campaign "${camp.title}" would exceed budget. ` +
                        `Remaining: ₹${b.remaining}, additional: ₹${additionalEarnings}`,
                    );
                    return;
                  }
                }
              }
            }
          }

          setState((s) => {
            const at = Date.now();
            const entry: AuditEntry = {
              action: status,
              by: actor,
              at,
              note:
                patch?.rejectionReason ?? patch?.failureReason ?? patch?.heldReason,
            };
            return {
              ...s,
              clips: s.clips.map((k) => {
                if (k.id !== id) return k;
                const earned = EARNED_STATUSES.includes(status);
                const merged: Clip = {
                  ...k,
                  status,
                  ...patch,
                  // A clip earns a stable transaction id the moment it becomes a
                  // financial transaction (approved and beyond). Deriving it from
                  // the clip id keeps it unique without extra id generation.
                  txnId: earned ? (k.txnId ?? `TXN-${k.id.toUpperCase()}`) : k.txnId,
                  updatedAt: at,
                  payoutDate: status === "paid" ? at : k.payoutDate,
                  payoutRef:
                    status === "paid"
                      ? k.payoutRef ?? `PAY-${k.id.toUpperCase()}-${at}`
                      : k.payoutRef,
                  audit: [...(k.audit ?? []), entry],
                };
                // Keep local state in sync with the DB: a clip that is no
                // longer rejected/failed should not show a stale reason.
                if (status !== "rejected" && patch?.rejectionReason === undefined)
                  merged.rejectionReason = undefined;
                if (status !== "failed" && patch?.failureReason === undefined)
                  merged.failureReason = undefined;
                if (status !== "held" && patch?.heldReason === undefined)
                  merged.heldReason = undefined;
                return merged;
              }),
            };
          });

          // Auto-update campaign budget status (runs after the clip setState above).
          setState((s) => {
            const changedClip = s.clips.find((k) => k.id === id);
            if (!changedClip || !isTransitioningToEarned) return s;
            const camp = s.campaigns.find((x) => x.id === changedClip.campaignId);
            if (!camp || !camp.budget || camp.budget <= 0) return s;
            const b = campaignBudget(camp, s.clips);
            let newStatus: CampaignStatus = camp.status;
            if (b.status === "budget_reached" && camp.status === "open") {
              newStatus = "budget_reached";
            } else if (b.status === "near_budget" && camp.status === "open") {
              newStatus = "near_budget";
            } else if (
              b.status === "ok" &&
              (camp.status === "budget_reached" || camp.status === "near_budget")
            ) {
              newStatus = "open";
            }
            if (newStatus === camp.status) return s;
            if (isSupabaseConfigured) {
              ignore(supabase.from("campaigns").update({ status: newStatus }).eq("id", camp.id));
            }
            return {
              ...s,
              campaigns: s.campaigns.map((x) =>
                x.id === camp.id ? { ...x, status: newStatus } : x,
              ),
            };
          });

         if (!isSupabaseConfigured) return;
         const update: Record<string, unknown> = { status };
         if (patch?.rejectionReason !== undefined)
           update.rejection_reason = patch.rejectionReason;
         else if (status !== "rejected") update.rejection_reason = null;
         if (patch?.rejectionDetails !== undefined)
           update.rejection_details = patch.rejectionDetails;
         else if (status !== "rejected") update.rejection_details = null;
         if (patch?.failureReason !== undefined)
           update.failure_reason = patch.failureReason;
         else if (status !== "failed") update.failure_reason = null;
         if (patch?.heldReason !== undefined) update.held_reason = patch.heldReason;
         else if (status !== "held") update.held_reason = null;
         const existing = stateRef.current.clips.find((k) => k.id === id);
         const at = Date.now();
         update.txn_id =
           existing && EARNED_STATUSES.includes(status)
             ? (existing.txnId ?? `TXN-${id.toUpperCase()}`)
             : existing?.txnId ?? null;
         update.updated_at = new Date(at).toISOString();
         if (status === "paid") {
           update.payout_date = new Date(at).toISOString();
           update.payout_ref =
             existing?.payoutRef ?? `PAY-${id.toUpperCase()}-${at}`;
         }
         update.audit = [
           ...(existing?.audit ?? []),
           {
             action: status,
             by: actor,
             at,
             note:
               patch?.rejectionReason ?? patch?.failureReason ?? patch?.heldReason,
           },
         ];
           ignore(supabase.from("clips").update(update).eq("id", id));
         },

      closeCampaign: async (id) => {
        // SECURITY: Only campaign creator or admins can close campaigns.
        const me = await getCurrentUser();
        const existingCamp = stateRef.current.campaigns.find((c) => c.id === id);
        if (me && existingCamp && existingCamp.created_by !== me.id && !isUserAdmin(me)) {
          console.error(`Authorization: user ${me.id} cannot close campaign ${id}`);
          return;
        }
        setState((s) => ({
          ...s,
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, status: "closed" } : c,
          ),
        }));
        appendAuditLog({
          actor: "admin",
          action: "campaign_closed",
          targetType: "campaign",
          targetId: id,
          targetLabel: existingCamp?.title ?? id,
          previousValue: existingCamp?.status,
          newValue: "closed",
        });
        if (!isSupabaseConfigured) return;
        ignore(
          supabase.from("campaigns").update({ status: "closed" }).eq("id", id),
        );
      },

      deleteCampaign: async (id) => {
        // SECURITY: Only campaign creator or admins can delete campaigns.
        const me = await getCurrentUser();
        const camp = stateRef.current.campaigns.find((c) => c.id === id);
        if (isSupabaseConfigured && me && camp && camp.created_by && camp.created_by !== me.id && !isUserAdmin(me)) {
          console.error(`Authorization: user ${me.id} cannot delete campaign ${id}`);
          return;
        }
        setState((s) => ({ ...s, campaigns: s.campaigns.filter((c) => c.id !== id) }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("campaigns").delete().eq("id", id));
      },

      updateCampaign: async (id, patch, actor, action, note) => {
        // SECURITY: Only campaign creator or admins can update campaigns.
        const me = await getCurrentUser();
        const camp = stateRef.current.campaigns.find((c) => c.id === id);
        if (isSupabaseConfigured && me && camp && camp.created_by && camp.created_by !== me.id && !isUserAdmin(me)) {
          console.error(`Authorization: user ${me.id} cannot update campaign ${id}`);
          return;
        }
        setState((s) => {
          const entry: AuditEntry = {
            action: action ?? "updated",
            by: actor,
            at: Date.now(),
            note,
          };
          return {
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id
                ? { ...c, ...patch, audit: [...(c.audit ?? []), entry] }
                : c,
            ),
          };
        });
        appendAuditLog({
          actor: actor ?? "admin",
          action: "campaign_edited",
          targetType: "campaign",
          targetId: id,
          targetLabel: camp?.title ?? id,
          previousValue: camp ? JSON.stringify({ status: camp.status, payout: camp.payout, budget: camp.budget }) : undefined,
          newValue: JSON.stringify(patch),
          reason: note,
        });
        if (!isSupabaseConfigured) return;
        const update: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          const col = CAMPAIGN_DB_MAP[k];
          if (col) update[col] = (v as unknown) ?? null;
        }
        update.audit = [
          ...(camp?.audit ?? []),
          {
            action: action ?? "updated",
            by: actor,
            at: Date.now(),
            note,
          },
        ];
        ignore(supabase.from("campaigns").update(update).eq("id", id));
      },

      updateProfileStatus: (id, status, actor, reason) => {
        const patch: Partial<Profile> =
          status === "suspended"
            ? { status, suspendedReason: reason }
            : { status, suspendedReason: undefined };
        adminProfilePatch(id, patch, actor, status === "suspended" ? "suspended" : "reactivated", reason);
        const prof = stateRef.current.profiles.find((p) => p.id === id);
        appendAuditLog({
          actor: actor ?? "admin",
          action: status === "suspended" ? "user_suspended" : "user_reactivated",
          targetType: "user",
          targetId: id,
          targetLabel: prof?.name ?? prof?.email ?? id,
          previousValue: status === "suspended" ? "active" : "suspended",
          newValue: status,
          reason,
        });
      },

      verifyProfile: (id, actor, verified) => {
        adminProfilePatch(
          id,
          verified
            ? { verified: true, verifiedAt: Date.now() }
            : { verified: false, verifiedAt: undefined },
          actor,
          verified ? "verified" : "unverified",
        );
        const prof = stateRef.current.profiles.find((p) => p.id === id);
        appendAuditLog({
          actor: actor ?? "admin",
          action: verified ? "user_verified" : "user_unverified",
          targetType: "user",
          targetId: id,
          targetLabel: prof?.name ?? prof?.email ?? id,
          previousValue: verified ? "unverified" : "verified",
          newValue: verified ? "verified" : "unverified",
        });
      },

      setProfileRisk: (id, actor, flagged, note) => {
        adminProfilePatch(
          id,
          { riskFlag: flagged, riskNote: note },
          actor,
          flagged ? "risk_flagged" : "risk_cleared",
          note,
        );
        const prof = stateRef.current.profiles.find((p) => p.id === id);
        appendAuditLog({
          actor: actor ?? "admin",
          action: flagged ? "fraud_flag_created" : "fraud_flag_cleared",
          targetType: "fraud",
          targetId: id,
          targetLabel: prof?.name ?? prof?.email ?? id,
          previousValue: flagged ? "clear" : "flagged",
          newValue: flagged ? "flagged" : "clear",
          reason: note,
        });
      },

      saveAdminNotes: (id, notes, actor) => {
        adminProfilePatch(id, { adminNotes: notes }, actor, "admin_notes");
        const prof = stateRef.current.profiles.find((p) => p.id === id);
        appendAuditLog({
          actor: actor ?? "admin",
          action: "admin_notes",
          targetType: "user",
          targetId: id,
          targetLabel: prof?.name ?? prof?.email ?? id,
          reason: notes,
        });
      },

      respondToAppeal: (id, appealId, response, status, actor) => {
        const profile = stateRef.current.profiles.find((p) => p.id === id);
        if (!profile?.appeals) return;
        const appeals = profile.appeals.map((a) =>
          a.id === appealId ? { ...a, status, response, at: a.at } : a,
        );
        adminProfilePatch(id, { appeals }, actor, "appeal_response", response);
        appendAuditLog({
          actor: actor ?? "admin",
          action: "appeal_response",
          targetType: "user",
          targetId: id,
          targetLabel: profile.name ?? profile.email ?? id,
          newValue: status,
          reason: response,
        });
      },

      deleteProfile: async (id) => {
        // SECURITY: Only admins can delete profiles.
        const me = await getCurrentUser();
        if (!me || !isUserAdmin(me)) {
          console.error(`Authorization: user ${me?.id ?? "anonymous"} cannot delete profile ${id}`);
          return;
        }
        setState((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("profiles").delete().eq("id", id));
      },

      updateProfile: async (id, patch) => {
        // SECURITY: Users can only update their own profile. Admins can update any.
        const me = await getCurrentUser();
        if (me && me.id !== id && !isUserAdmin(me)) {
          console.error(`Authorization: user ${me.id} cannot update profile ${id}`);
          return;
        }
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
      toggleSaveCampaign: (id) => {
        setState((s) => ({
          ...s,
          savedCampaigns: s.savedCampaigns.includes(id)
            ? s.savedCampaigns.filter((x) => x !== id)
            : [...s.savedCampaigns, id],
        }));
      },
    };
  }, []);

  const value = { ...state, ...actions };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

// Reputation calculation functions

// Calculate per-clipper reputation metrics from clips
export function calculateClipperReputation(clips: Clip[], userId: string, campaigns: Campaign[], socialAccounts?: { verified?: boolean }[]): {
  totalApproved: number;
  totalRejected: number;
  approvalRate: number;
  totalVerifiedViews: number;
  successfulCampaigns: number;
  totalEarned: number;
  completedPayouts: number;
  accountAge: number;
  verifiedSocialAccounts: number;
} {
  const clipperClips = clips.filter((k) => k.userId === userId || k.clipper === userId);
  
  const totalApproved = clipperClips.filter((k) => EARNED_STATUSES.includes(k.status)).length;
  const totalRejected = clipperClips.filter((k) => k.status === "rejected").length;
  const approvalRate = totalApproved > 0 ? (totalApproved / (totalApproved + totalRejected) * 100) : 0;
  
  const verifiedClips = clipperClips.filter((k) => isEarned(k.status));
  const totalVerifiedViews = verifiedClips.reduce((sum, k) => sum + k.views, 0);
  
  const successfulCampaigns = new Set(
    clipperClips.map((k) => k.campaignId)
  ).size;
  
  const totalEarned = financeOf(clipperClips, campaigns).earned;
  
  const completedPayouts = clipperClips.filter((k) => k.status === "paid").length;
  
  const submittedDates = clipperClips.map((k) => k.submittedAt);
  const accountAge = submittedDates.length > 0 
    ? Math.floor((Date.now() - Math.min(...submittedDates)) / (1000 * 60 * 60 * 24))
    : 0;
  
  const verifiedSocialAccounts = socialAccounts
    ? socialAccounts.filter((a) => a.verified).length
    : 0;
  
  return {
    totalApproved,
    totalRejected,
    approvalRate,
    totalVerifiedViews,
    successfulCampaigns,
    totalEarned,
    completedPayouts,
    accountAge,
    verifiedSocialAccounts,
  };
}

// Calculate overall reputation score (0-100) using transparent rules
export function calculateReputationScore(metrics: {
  totalApproved: number;
  totalRejected: number;
  approvalRate: number;
  totalVerifiedViews: number;
  successfulCampaigns: number;
  totalEarned: number;
  completedPayouts: number;
  accountAge: number;
  verifiedSocialAccounts: number;
}): number {
  let score = 0;
  
  score += metrics.approvalRate * 0.4;
  
  const successRate = metrics.successfulCampaigns > 0 
    ? Math.min(metrics.successfulCampaigns / Math.max(metrics.successfulCampaigns + 1, 1), 1) * 100
    : 0;
  score += successRate * 0.3;
  
  const payoutSuccessRate = metrics.totalApproved > 0
    ? Math.min(metrics.completedPayouts / metrics.totalApproved, 1) * 100
    : 0;
  score += payoutSuccessRate * 0.2;
  
  score += Math.min(metrics.verifiedSocialAccounts / 10, 1) * 100 * 0.1;
  
  return Math.round(Math.max(0, Math.min(100, score)));
}

// Determine badges based on reputation metrics
export function determineBadges(metrics: {
  totalApproved: number;
  approvalRate: number;
  verifiedViews: number;
  successfulCampaigns: number;
  completedPayouts: number;
  accountAge: number;
  verifiedSocialAccounts: number;
}): string[] {
  const badges: string[] = [];
  
  if (metrics.verifiedViews > 0) {
    badges.push("Verified Clipper");
  }
  
  if (metrics.approvalRate > 80 && metrics.successfulCampaigns > 2) {
    badges.push("Top Performer");
  }
  
  if (metrics.approvalRate > 90) {
    badges.push("High Approval Rate");
  }
  
  if (metrics.accountAge > 90 && metrics.totalApproved > 5) {
    badges.push("Consistent Creator");
  }
  
  return badges;
}

// Calculate reputation score and badges for a clipper
export function getClipperReputation(clips: Clip[], userId: string, campaigns: Campaign[], socialAccounts?: { verified?: boolean }[]) {
  const metrics = calculateClipperReputation(clips, userId, campaigns, socialAccounts);
  const score = calculateReputationScore(metrics);
  const badges = determineBadges({
    totalApproved: metrics.totalApproved,
    approvalRate: metrics.approvalRate,
    verifiedViews: metrics.totalVerifiedViews,
    successfulCampaigns: metrics.successfulCampaigns,
    completedPayouts: metrics.completedPayouts,
    accountAge: metrics.accountAge,
    verifiedSocialAccounts: metrics.verifiedSocialAccounts,
  });
  
  return { score, metrics, badges };
}

