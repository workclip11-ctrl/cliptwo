"use client";

import {
  createContext,
  useCallback,
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
  FinanceRecord,
  PayoutRequest,
} from "./types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { financeOf } from "@/lib/finance";
import { initAuditLogs } from "@/lib/audit";

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
      userId: "u_maya",
      videoUrl: "https://instagram.com/reel/xk29a",
      caption: "This app is unhinged 🔥 #tech",
      status: "approved",
      views: 18400,
      verifiedViews: 16560,
      submittedAt: Date.now() - 1000 * 60 * 60 * 20,
      platform: "Instagram",
      engagement: { likes: 2100, comments: 142, shares: 380 },
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 20 },
          { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 18 },
        ],
      },
    {
      id: "k2",
      campaignId: "c1",
      clipper: "devon.edits",
      userId: "u_devon",
      videoUrl: "https://youtube.com/shorts/8kd92",
      caption: "The keynote moment everyone missed",
        status: "pending",
        views: 0,
        verifiedViews: 0,
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
      userId: "u_maya",
      videoUrl: "https://instagram.com/reel/pw001",
      caption: "3 moves that fixed my posture",
        status: "pending",
        views: 0,
        verifiedViews: 0,
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
      userId: "u_maya",
      videoUrl: "https://instagram.com/reel/xk44b",
      caption: "The keynote but with a loud soundtrack",
      status: "rejected",
      views: 6200,
      verifiedViews: 5580,
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
      userId: "u_maya",
      videoUrl: "https://instagram.com/reel/xk51p",
      caption: "3 quick takes from the keynote",
      status: "approved",
      views: 9100,
      verifiedViews: 8190,
      submittedAt: Date.now() - 1000 * 60 * 60 * 30,
      platform: "Instagram",
        engagement: { likes: 510, comments: 33, shares: 44 },
        audit: [
          { action: "submitted", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 30 },
          { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 28 },
        ],
    },
    {
      id: "kp1",
      campaignId: "c1",
      clipper: "priya.viral",
      userId: "u_priya",
      videoUrl: "https://instagram.com/reel/priya01",
      caption: "This app actually fixed my screen-time 😭",
      status: "approved",
      views: 52000,
      verifiedViews: 46800,
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
      userId: "u_priya",
      videoUrl: "https://instagram.com/reel/priya02",
      caption: "3 features you missed",
      status: "approved",
      views: 31000,
      verifiedViews: 27900,
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
      userId: "u_priya",
      videoUrl: "https://youtube.com/shorts/priya03",
      caption: "The aha moment",
      status: "approved",
      views: 12000,
      verifiedViews: 10800,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      platform: "YouTube",
      engagement: { likes: 1200, comments: 90, shares: 140 },
      audit: [
        { action: "submitted", by: "priya.viral", at: Date.now() - 1000 * 60 * 60 * 24 * 3 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 2 },
      ],
    },
    {
      id: "kar1",
      campaignId: "c2",
      clipper: "arjun.cuts",
      userId: "u_arjun",
      videoUrl: "https://instagram.com/reel/arjun01",
      caption: "Posture fix in 30s",
      status: "approved",
      views: 18000,
      verifiedViews: 16200,
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
      userId: "u_rahul",
      videoUrl: "https://instagram.com/reel/xyz789",
      caption: "Viral hack!!",
      status: "rejected",
      views: 88000,
      verifiedViews: 79200,
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
      userId: "u_rahul",
      videoUrl: "https://instagram.com/reel/abc456",
      caption: "Another one",
      status: "approved",
      views: 2400,
      verifiedViews: 2160,
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
      userId: "u_banned",
      videoUrl: "https://instagram.com/reel/spam01",
      caption: "Buy followers",
      status: "rejected",
      views: 60000,
      verifiedViews: 54000,
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
      userId: "u_banned",
      videoUrl: "https://youtube.com/shorts/spam02",
      caption: "Spam reel",
      status: "approved",
      views: 3000,
      verifiedViews: 2700,
      submittedAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
      platform: "YouTube",
      engagement: { likes: 20, comments: 1, shares: 2 },
      audit: [
        { action: "submitted", by: "banned.user", at: Date.now() - 1000 * 60 * 60 * 24 * 6 },
        { action: "approved", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 5 },
      ],
    },
    {
      id: "ksb1",
      campaignId: "c2",
      clipper: "simran.m",
      userId: "u_simran",
      videoUrl: "https://instagram.com/reel/simran01",
      caption: "My first cut",
      status: "pending",
      views: 0,
      verifiedViews: 0,
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
      userId: "u_leo",
      videoUrl: "https://instagram.com/reel/leo01",
      caption: "Smooth transition edit",
      status: "approved",
      views: 9000,
      verifiedViews: 8100,
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
      userId: "u_leo",
      videoUrl: "https://instagram.com/reel/leo02",
      caption: "Off-brief try",
      status: "rejected",
      views: 2000,
      verifiedViews: 1800,
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
      userId: "u_priya",
      videoUrl: "https://instagram.com/reel/maker01",
      caption: "Maker House — assembly reel",
      status: "approved",
      views: 21000,
      verifiedViews: 18900,
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
      userId: "u_maya",
      videoUrl: "https://youtube.com/shorts/maker02",
      caption: "Maker House — top 5 tools",
      status: "approved",
      views: 13500,
      verifiedViews: 12150,
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
      userId: "u_devon",
      videoUrl: "https://instagram.com/reel/kabir01",
      caption: "Stand-up — Delhi Live highlight",
      status: "approved",
      views: 9200,
      verifiedViews: 8280,
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
      userId: "u_simran",
      videoUrl: "https://instagram.com/reel/hold01",
      caption: "Teaser with unlicensed audio",
      status: "held",
      views: 7600,
      verifiedViews: 6840,
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
  financeRecords: [
    {
      id: "fr_k1",
      clipId: "k1",
      campaignId: "c1",
      clipperId: "u_maya",
      lockedCpm: 220,
      lockedMaxPayout: 5000,
      verifiedViews: 16560,
      grossAmount: 3643,
      platformFee: 364,
      netAmount: 3279,
      status: "paid",
      upiIdSnapshot: "maya.reddy@okaxis",
      paymentReference: "NEFT-2026-K1-001",
      paidBy: "u_admin",
      createdAt: Date.now() - 1000 * 60 * 60 * 18,
      processingAt: Date.now() - 1000 * 60 * 60 * 14,
      paidAt: Date.now() - 1000 * 60 * 60 * 10,
      audit: [
        { action: "finance_created", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 18 },
        { action: "finance_processing", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 14 },
        { action: "finance_paid", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 10 },
      ],
    },
    {
      id: "fr_kp3",
      clipId: "kp3",
      campaignId: "c1",
      clipperId: "u_priya",
      lockedCpm: 220,
      lockedMaxPayout: 5000,
      verifiedViews: 10800,
      grossAmount: 2376,
      platformFee: 238,
      netAmount: 2138,
      status: "pending",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
      audit: [
        { action: "finance_created", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 2 },
      ],
    },
    {
      id: "fr_kc3b",
      clipId: "kc3b",
      campaignId: "c3",
      clipperId: "u_maya",
      lockedCpm: 280,
      lockedMaxPayout: 8000,
      verifiedViews: 12150,
      grossAmount: 3402,
      platformFee: 340,
      netAmount: 3062,
      status: "pending",
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 1,
      audit: [
        { action: "finance_created", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 24 * 1 },
      ],
    },
  ],
  payoutRequests: [
    {
      id: "pr_maya_1",
      userId: "u_maya",
      amount: 3279,
      netAmount: 3279,
      currency: "INR",
      status: "paid",
      method: "upi",
      upiId: "maya.reddy@okaxis",
      paymentReference: "NEFT-2026-K1-001",
      paidBy: "u_admin",
      createdAt: Date.now() - 1000 * 60 * 60 * 12,
      processingAt: Date.now() - 1000 * 60 * 60 * 11,
      paidAt: Date.now() - 1000 * 60 * 60 * 10,
      financeRecordIds: ["fr_k1"],
      audit: [
        { action: "payout_requested", by: "maya.cuts", at: Date.now() - 1000 * 60 * 60 * 12 },
        { action: "payout_processing", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 11 },
        { action: "payout_paid", by: "workclip11@gmail.com", at: Date.now() - 1000 * 60 * 60 * 10 },
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
      providerAccountId: "ig_17841400123456789",
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
      providerAccountId: "UC_abc123def456",
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
      providerAccountId: "ig_17841400987654321",
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
      providerAccountId: "ig_17841405555555555",
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
      providerAccountId: "UC_xyz789ghi012",
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
      providerAccountId: "ig_17841407777777777",
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
    },
  ],
  siteSettings: {
    heroTitle: "",
    heroSubtitle: "",
    featuredIds: [],
  },
  savedCampaigns: [],
};

interface StoreActions {
  clearError: () => void;
  addCampaign: (
    c: Omit<Campaign, "id" | "createdAt" | "status">,
    status?: CampaignStatus,
    campaignId?: string,
  ) => Promise<string | null>;
  addClip: (k: Omit<Clip, "id" | "submittedAt" | "status" | "views">) => void;
  approveClip: (id: string, actor?: string) => void;
  rejectClip: (id: string, reason: string, details?: string, actor?: string) => void;
  holdClip: (id: string, reason: string, actor?: string) => void;
  requestPayout: () => void;
  processPayoutRequest: (payoutId: string, actor?: string) => void;
  completePayoutRequest: (payoutId: string, paymentRef?: string, actor?: string) => void;
  closeCampaign: (id: string, reason?: string) => Promise<void>;
  pauseCampaign: (id: string, reason?: string) => Promise<void>;
  resumeCampaign: (id: string, reason?: string) => Promise<void>;
  reopenCampaign: (id: string, reason?: string) => Promise<void>;
  publishCampaign: (id: string, reason?: string) => Promise<void>;
  adjustBudget: (id: string, newBudget: number, reason?: string) => Promise<void>;
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
  deactivateProfile: (id: string, reason?: string) => Promise<void>;
  deactivateOwnAccount: () => Promise<void>;
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
  updateProfile: (id: string, patch: Partial<Pick<Profile, "name" | "upi" | "bio" | "company" | "team" | "username">>) => void;
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
    archived_at: r.archived_at ? String(r.archived_at) : undefined,
    archived_by: r.archived_by ? String(r.archived_by) : undefined,
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
    providerAccountId: r.provider_account_id ? String(r.provider_account_id) : undefined,
    avatarUrl: r.avatar_url ? String(r.avatar_url) : undefined,
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
    verifiedViews: Number(r.verified_views ?? 0),
    lockedCpm: r.locked_cpm != null ? Number(r.locked_cpm) : undefined,
    lockedMaxPayout: r.locked_max_payout != null ? Number(r.locked_max_payout) : undefined,
    submittedAt: r.submitted_at ? new Date(String(r.submitted_at)).getTime() : Date.now(),
    platform: (r.platform as Platform) ?? "Instagram",
    userId: r.user_id ? String(r.user_id) : undefined,
    rejectionReason: r.rejection_reason ? String(r.rejection_reason) : undefined,
    rejectionDetails: r.rejection_details ? String(r.rejection_details) : undefined,
    heldReason: r.held_reason ? String(r.held_reason) : undefined,
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).getTime() : undefined,
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
    deactivatedAt: r.deactivated_at ? String(r.deactivated_at) : undefined,
    deactivatedBy: r.deactivated_by ? String(r.deactivated_by) : undefined,
    appeals: Array.isArray(r.appeals) ? (r.appeals as Appeal[]) : undefined,
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : undefined,
  };
}

function mapSiteSettings(r: Record<string, unknown> | null): SiteSettings {
  if (!r) {
    return { heroTitle: "", heroSubtitle: "", featuredIds: [] };
  }
  const fids = r.featured_ids;
  return {
    heroTitle: r.hero_title ? String(r.hero_title) : "",
    heroSubtitle: r.hero_subtitle ? String(r.hero_subtitle) : "",
    featuredIds: Array.isArray(fids) ? (fids as unknown[]).map(String) : [],
  };
}

function mapFinanceRecord(r: Record<string, unknown>): FinanceRecord {
  return {
    id: String(r.id),
    clipId: String(r.clip_id),
    campaignId: String(r.campaign_id),
    clipperId: r.clipper_id ? String(r.clipper_id) : undefined,
    lockedCpm: Number(r.locked_cpm ?? 0),
    lockedMaxPayout: r.locked_max_payout != null ? Number(r.locked_max_payout) : undefined,
    verifiedViews: Number(r.verified_views ?? 0),
    grossAmount: Number(r.gross_amount ?? 0),
    platformFee: Number(r.platform_fee ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    status: (r.status as "pending" | "processing" | "paid") ?? "pending",
    upiIdSnapshot: r.upi_id_snapshot ? String(r.upi_id_snapshot) : undefined,
    paymentReference: r.payment_reference ? String(r.payment_reference) : undefined,
    paidBy: r.paid_by ? String(r.paid_by) : undefined,
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    processingAt: r.processing_at ? new Date(String(r.processing_at)).getTime() : undefined,
    paidAt: r.paid_at ? new Date(String(r.paid_at)).getTime() : undefined,
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : undefined,
  };
}

function mapPayoutRequest(r: Record<string, unknown>): PayoutRequest {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    amount: Number(r.amount ?? 0),
    netAmount: Number(r.net_amount ?? 0),
    currency: String(r.currency ?? "INR"),
    status: (r.status as "pending" | "processing" | "paid") ?? "pending",
    method: String(r.method ?? "upi"),
    upiId: String(r.upi_id ?? ""),
    paymentReference: r.payment_reference ? String(r.payment_reference) : undefined,
    paidBy: r.paid_by ? String(r.paid_by) : undefined,
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    processingAt: r.processing_at ? new Date(String(r.processing_at)).getTime() : undefined,
    paidAt: r.paid_at ? new Date(String(r.paid_at)).getTime() : undefined,
    financeRecordIds: Array.isArray(r.finance_record_ids) ? (r.finance_record_ids as string[]) : [],
    audit: Array.isArray(r.audit) ? (r.audit as AuditEntry[]) : undefined,
  };
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);

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
  const [state, _setState] = useState<StoreState>(seed);
  const stateRef = useRef(state);
  const loadedRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
  });

  const setState = useCallback((updater: StoreState | ((s: StoreState) => StoreState)) => {
    _setState((prev) => {
      const next = typeof updater === "function" ? (updater as (s: StoreState) => StoreState)(prev) : updater;
      if (!isSupabaseConfigured && loadedRef.current) saveLocalState(next);
      return next;
    });
  }, []);

  // Load saved state from localStorage on client mount
  useEffect(() => {
    if (isSupabaseConfigured) {
      loadedRef.current = true;
      return;
    }
    const saved = loadLocalState();
    loadedRef.current = true;
    if (saved) setState((s) => ({ ...s, ...saved }));
  }, [setState]);

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
        { data: fins },
        { data: payouts },
      ] = await Promise.all([
        supabase.from("campaigns").select("*"),
        supabase.from("clips").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("social_accounts").select("*"),
        supabase.from("site_settings_public").select("*").eq("id", 1).maybeSingle(),
        // SECURITY: Use get_safe_finance_records() instead of direct table access.
        // This function strips sensitive fields (clipper_id, upi_id_snapshot,
        // payment_reference, paid_by) for creators, while returning full data
        // for clippers (own records) and admins (all records).
        supabase.rpc("get_safe_finance_records").then(({ data, error }) => {
          if (error) return { data: null };
          // RPC returns array of objects; map to FinanceRecord shape
          return { data };
        }),
        supabase.from("payout_requests").select("*"),
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
      if (fins)
        setState((s) => ({ ...s, financeRecords: fins.map(mapFinanceRecord) }));
      if (payouts)
        setState((s) => ({ ...s, payoutRequests: payouts.map(mapPayoutRequest) }));
    })().catch(() => {
      /* keep seed on failure */
    });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // SECURITY: Always query profiles.role (server-controlled), never trust user_metadata.
    async function isUserAdmin(userId: string | undefined | null): Promise<boolean> {
      if (!isSupabaseConfigured || !userId) return false;
      try {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        return data?.role === "admin";
      } catch {
        return false;
      }
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
      if (!await isUserAdmin(me?.id)) {
        console.error(`Authorization: non-admin user cannot admin-patch profile ${id}`);
        return;
      }
      // Capture previous state for rollback
      const prevProfiles = stateRef.current.profiles;
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
      const { error } = await supabase.from("profiles").update(update).eq("id", id);
      if (error) {
        console.error("Profile update failed:", error.message);
        setState((s) => ({ ...s, profiles: prevProfiles, lastError: `Profile update failed: ${error.message}` }));
      }
    };

    return {
      clearError: () => {
        setState((s) => ({ ...s, lastError: undefined }));
      },
      addCampaign: async (c, status = "open", campaignId) => {
        // SECURITY: Every campaign must have a creator (created_by).
        // The caller must provide created_by. If missing, the campaign is
        // rejected in production (Supabase enforces NOT NULL via RPC).
        // If campaignId is provided, use it (allows pre-specifying for storage path consistency).
        const campaignIdValue = campaignId ?? `c${Date.now()}`;
        const optimistic: Campaign = {
          ...c,
          id: campaignIdValue,
          createdAt: Date.now(),
          status,
          created_by: c.created_by,
        };
        setState((s) => ({ ...s, campaigns: [optimistic, ...s.campaigns] }));

        if (!isSupabaseConfigured) return campaignIdValue;

        // SECURITY: Use RPC for server-side creator role validation
        const { data, error } = await supabase.rpc("create_campaign", {
          p_id: campaignId,
          p_title: c.title,
          p_brief: c.brief,
          p_platform: c.platform,
          p_payout: c.payout,
          p_creator: c.creator,
          p_niche: c.niche ?? null,
          p_budget: c.budget ?? 0,
          p_days_left: c.daysLeft ?? 30,
          p_source_link: c.sourceLink ?? null,
          p_rules: c.rules ?? null,
          p_category: c.category ?? null,
          p_platforms: c.platforms ?? null,
          p_objective: c.objective ?? null,
          p_start_date: c.startDate ?? null,
          p_end_date: c.endDate ?? null,
          p_max_payout_per_clip: c.maxPayoutPerClip ?? null,
          p_recommended_duration: c.recommendedDuration ?? null,
          p_hook: c.hook ?? null,
          p_caption_req: c.captionReq ?? null,
          p_aspect_ratio: c.aspectRatio ?? null,
          p_cta: c.cta ?? null,
          p_branding: c.branding ?? null,
          p_do_list: c.doList ?? null,
          p_dont_list: c.dontList ?? null,
          p_source_assets: c.sourceAssets ?? null,
          p_example_clips: c.exampleClips ?? null,
          p_view_rules: c.viewRules ?? null,
          p_approval: c.approval ?? null,
          p_thumbnails: c.thumbnails ?? null,
          p_brand_assets: c.brandAssets ?? null,
          p_spend_cap: c.spendCap ?? null,
          p_timezone: c.timezone ?? null,
          p_what_to_make: c.whatToMake ?? null,
          p_style: c.style ?? null,
          p_rights: c.rights ?? null,
          p_status: status,
        });
        if (error) {
          // Remove optimistic campaign from state on failure
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.filter((x) => x.id !== optimistic.id),
            lastError: `Failed to create campaign: ${error.message}`,
          }));
          throw new Error(error.message);
        }
        if (data) {
          setState((s) => ({
            ...s,
            campaigns: [
              mapCampaign(data as Record<string, unknown>),
              ...s.campaigns.filter((x) => x.id !== optimistic.id),
            ],
          }));
        }
        return campaignIdValue;
      },

      addClip: (k) => {
        const cur = stateRef.current;
        const camp = cur.campaigns.find((c) => c.id === k.campaignId);

        const optimistic: Clip = {
          ...k,
          id: `k${Date.now()}`,
          submittedAt: Date.now(),
          status: "pending",
          views: 0,
          verifiedViews: 0,
          lockedCpm: camp?.payout,
          lockedMaxPayout: camp?.maxPayoutPerClip,
        };
        setState((s) => ({ ...s, clips: [optimistic, ...s.clips] }));

        if (!isSupabaseConfigured) return;
        (async () => {
          // Server-side validation: submit_clip RPC checks role, campaign status,
          // budget, platform, duplicate URLs, and locks the campaign row.
          const { data, error } = await supabase.rpc("submit_clip", {
            p_campaign_id: k.campaignId,
            p_caption: k.caption,
            p_video_url: k.videoUrl,
            p_platform: k.platform ?? "Instagram",
          });
          if (error) {
            // Rollback optimistic clip on failure
            setState((s) => ({
              ...s,
              clips: s.clips.filter((x) => x.id !== optimistic.id),
              lastError: `Failed to submit clip: ${error.message}`,
            }));
            return;
          }
          if (data) {
            // Replace optimistic clip with server-returned clip
            setState((s) => ({
              ...s,
              clips: [
                mapClip(data as Record<string, unknown>),
                ...s.clips.filter((x) => x.id !== optimistic.id),
              ],
            }));
          }
        })();
      },

       approveClip: async (id, actor) => {
          const me = await getCurrentUser();
          if (!await isUserAdmin(me?.id)) {
            console.error(`Authorization: non-admin user cannot approve clip ${id}`);
            return;
          }
          const prevClips = stateRef.current.clips;
          const prevFinance = stateRef.current.financeRecords;
          // Optimistic: set clip to approved
          setState((s) => ({
            ...s,
            clips: s.clips.map((k) =>
              k.id === id ? { ...k, status: "approved" as ClipStatus, updatedAt: Date.now(), audit: [...(k.audit ?? []), { action: "approved", by: actor, at: Date.now() }] } : k,
            ),
          }));
          if (!isSupabaseConfigured) return;
          const { data, error } = await supabase.rpc("approve_clip", {
            p_clip_id: id,
            p_actor: actor ?? null,
          });
          if (error) {
            console.error("RPC approve_clip failed:", error.message);
            setState((s) => ({ ...s, clips: prevClips, financeRecords: prevFinance, lastError: `Approve clip failed: ${error.message}` }));
            return;
          }
          // Server returns the financial record
          const record = data as Record<string, unknown>;
          if (record?.id) {
            setState((s) => ({
              ...s,
              financeRecords: [mapFinanceRecord(record), ...s.financeRecords.filter((r) => r.clipId !== id)],
            }));
          }
          },

       rejectClip: async (id, reason, details, actor) => {
          const me = await getCurrentUser();
          if (!await isUserAdmin(me?.id)) {
            console.error(`Authorization: non-admin user cannot reject clip ${id}`);
            return;
          }
          const prevClips = stateRef.current.clips;
          setState((s) => ({
            ...s,
            clips: s.clips.map((k) =>
              k.id === id ? { ...k, status: "rejected" as ClipStatus, rejectionReason: reason, rejectionDetails: details, updatedAt: Date.now(), audit: [...(k.audit ?? []), { action: "rejected", by: actor, at: Date.now(), note: reason }] } : k,
            ),
          }));
          if (!isSupabaseConfigured) return;
          const { error } = await supabase.rpc("admin_clip_action", {
            p_clip_id: id,
            p_action: "reject",
            p_reason: reason,
            p_details: details ?? null,
          });
          if (error) {
            console.error("RPC admin_clip_action (reject) failed:", error.message);
            setState((s) => ({ ...s, clips: prevClips, lastError: `Reject clip failed: ${error.message}` }));
          }
          },

       holdClip: async (id, reason, actor) => {
          const me = await getCurrentUser();
          if (!await isUserAdmin(me?.id)) {
            console.error(`Authorization: non-admin user cannot hold clip ${id}`);
            return;
          }
          const prevClips = stateRef.current.clips;
          setState((s) => ({
            ...s,
            clips: s.clips.map((k) =>
              k.id === id ? { ...k, status: "held" as ClipStatus, heldReason: reason, updatedAt: Date.now(), audit: [...(k.audit ?? []), { action: "held", by: actor, at: Date.now(), note: reason }] } : k,
            ),
          }));
          if (!isSupabaseConfigured) return;
          const { error } = await supabase.rpc("admin_clip_action", {
            p_clip_id: id,
            p_action: "hold",
            p_reason: reason,
          });
          if (error) {
            console.error("RPC admin_clip_action (hold) failed:", error.message);
            setState((s) => ({ ...s, clips: prevClips, lastError: `Hold clip failed: ${error.message}` }));
          }
           },

       requestPayout: async () => {
          const me = await getCurrentUser();
          if (!me) {
            setState((s) => ({ ...s, lastError: "Not authenticated" }));
            return;
          }
          if (!isSupabaseConfigured) return;
          const { data, error } = await supabase.rpc("request_payout");
          if (error) {
            console.error("RPC request_payout failed:", error.message);
            setState((s) => ({ ...s, lastError: `Payout request failed: ${error.message}` }));
            return;
          }
          const payout = data as Record<string, unknown>;
          if (payout?.id) {
            setState((s) => ({
              ...s,
              payoutRequests: [mapPayoutRequest(payout), ...s.payoutRequests],
            }));
          }
          },

       processPayoutRequest: async (payoutId, actor) => {
          const me = await getCurrentUser();
          if (!await isUserAdmin(me?.id)) {
            console.error("Authorization: non-admin user cannot process payout");
            return;
          }
          const prevPayouts = stateRef.current.payoutRequests;
          setState((s) => ({
            ...s,
            payoutRequests: s.payoutRequests.map((p) =>
              p.id === payoutId ? { ...p, status: "processing" as const, processingAt: Date.now() } : p,
            ),
          }));
          if (!isSupabaseConfigured) return;
          const { data, error } = await supabase.rpc("process_payout_request", {
            p_payout_id: payoutId,
            p_actor: actor ?? null,
          });
          if (error) {
            console.error("RPC process_payout_request failed:", error.message);
            setState((s) => ({ ...s, payoutRequests: prevPayouts, lastError: `Process payout failed: ${error.message}` }));
            return;
          }
          const payout = data as Record<string, unknown>;
          if (payout?.id) {
            setState((s) => ({
              ...s,
              payoutRequests: s.payoutRequests.map((p) => p.id === payoutId ? mapPayoutRequest(payout) : p),
            }));
          }
          },

       completePayoutRequest: async (payoutId, paymentRef, actor) => {
          const me = await getCurrentUser();
          if (!await isUserAdmin(me?.id)) {
            console.error("Authorization: non-admin user cannot complete payout");
            return;
          }
          const prevPayouts = stateRef.current.payoutRequests;
          setState((s) => ({
            ...s,
            payoutRequests: s.payoutRequests.map((p) =>
              p.id === payoutId ? { ...p, status: "paid" as const, paidAt: Date.now(), paymentReference: paymentRef ?? p.paymentReference, paidBy: me?.id } : p,
            ),
          }));
          if (!isSupabaseConfigured) return;
          const { data, error } = await supabase.rpc("complete_payout_request", {
            p_payout_id: payoutId,
            p_payment_reference: paymentRef ?? null,
            p_actor: actor ?? null,
          });
          if (error) {
            console.error("RPC complete_payout_request failed:", error.message);
            setState((s) => ({ ...s, payoutRequests: prevPayouts, lastError: `Complete payout failed: ${error.message}` }));
            return;
          }
          const payout = data as Record<string, unknown>;
          if (payout?.id) {
            setState((s) => ({
              ...s,
              payoutRequests: s.payoutRequests.map((p) => p.id === payoutId ? mapPayoutRequest(payout) : p),
            }));
          }
          },

      closeCampaign: async (id) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: "closed" } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("campaign_action", {
          p_campaign_id: id,
          p_action: "close",
        });
        if (error) {
          console.error("RPC campaign_action(close) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to close campaign: ${error.message}` }));
          return;
        }
        const result = data as { to?: string };
        if (result?.to) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: result.to as CampaignStatus } : c,
            ),
          }));
        }
      },

      pauseCampaign: async (id, reason) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: "paused" } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("campaign_action", {
          p_campaign_id: id,
          p_action: "pause",
          p_reason: reason ?? "Paused by creator",
        });
        if (error) {
          console.error("RPC campaign_action(pause) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to pause campaign: ${error.message}` }));
          return;
        }
        const result = data as { to?: string };
        if (result?.to) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: result.to as CampaignStatus } : c,
            ),
          }));
        }
      },

      resumeCampaign: async (id, reason) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: "open" } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("campaign_action", {
          p_campaign_id: id,
          p_action: "resume",
          p_reason: reason ?? "Resumed by creator",
        });
        if (error) {
          console.error("RPC campaign_action(resume) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to resume campaign: ${error.message}` }));
          return;
        }
        const result = data as { to?: string };
        if (result?.to) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: result.to as CampaignStatus } : c,
            ),
          }));
        }
      },

      reopenCampaign: async (id, reason) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: "open" } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("campaign_action", {
          p_campaign_id: id,
          p_action: "reopen",
          p_reason: reason ?? "Reopened by creator",
        });
        if (error) {
          console.error("RPC campaign_action(reopen) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to reopen campaign: ${error.message}` }));
          return;
        }
        const result = data as { to?: string };
        if (result?.to) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: result.to as CampaignStatus } : c,
            ),
          }));
        }
      },

      publishCampaign: async (id, reason) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: "open" } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("campaign_action", {
          p_campaign_id: id,
          p_action: "publish",
          p_reason: reason ?? "Published by creator",
        });
        if (error) {
          console.error("RPC campaign_action(publish) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to publish campaign: ${error.message}` }));
          return;
        }
        const result = data as { to?: string };
        if (result?.to) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, status: result.to as CampaignStatus } : c,
            ),
          }));
        }
      },

      adjustBudget: async (id, newBudget, reason) => {
        const me = await getCurrentUser();
        if (!me) {
          setState((s) => ({ ...s, lastError: "Not authenticated" }));
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, budget: newBudget } : c,
            ),
          }));
          return;
        }
        const { data, error } = await supabase.rpc("adjust_campaign_budget", {
          p_campaign_id: id,
          p_new_budget: newBudget,
          p_reason: reason ?? "Budget adjusted by creator",
        });
        if (error) {
          console.error("RPC adjust_campaign_budget failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to adjust budget: ${error.message}` }));
          return;
        }
        const result = data as { budget?: number };
        if (result?.budget != null) {
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id ? { ...c, budget: result.budget } : c,
            ),
          }));
        }
      },

      deleteCampaign: async (id) => {
        const me = await getCurrentUser();
        const camp = stateRef.current.campaigns.find((c) => c.id === id);
        // Deny if campaign has no owner (production requires created_by) or user is not owner/admin
        if (isSupabaseConfigured && me && camp && (!camp.created_by || (camp.created_by !== me.id && !await isUserAdmin(me.id)))) {
          console.error(`Authorization: user ${me.id} cannot archive campaign ${id}`);
          return;
        }
        if (!isSupabaseConfigured) {
          // Local dev: mark as archived, preserve all associated data
          setState((s) => ({
            ...s,
            campaigns: s.campaigns.map((c) =>
              c.id === id
                ? { ...c, status: "archived" as const, archived_at: new Date().toISOString(), archived_by: me?.id }
                : c,
            ),
          }));
          return;
        }
        const { error } = await supabase.rpc("admin_campaign_action", {
          p_campaign_id: id,
          p_action: "archive",
        });
        if (error) {
          console.error("RPC admin_campaign_action (archive) failed:", error.message);
          setState((s) => ({ ...s, lastError: `Failed to archive campaign: ${error.message}` }));
          return;
        }
        // Mark as archived in local state (do NOT remove — preserve clips/earnings/audit)
        setState((s) => ({
          ...s,
          campaigns: s.campaigns.map((c) =>
            c.id === id
              ? { ...c, status: "archived" as const, archived_at: new Date().toISOString(), archived_by: me?.id }
              : c,
          ),
        }));
      },

      updateCampaign: async (id, patch, actor, action, note) => {
        // SECURITY: Only campaign creator or admins can update campaigns.
        const me = await getCurrentUser();
        const camp = stateRef.current.campaigns.find((c) => c.id === id);
        // Deny if campaign has no owner (production requires created_by) or user is not owner/admin
        if (isSupabaseConfigured && me && camp && (!camp.created_by || (camp.created_by !== me.id && !await isUserAdmin(me.id)))) {
          console.error(`Authorization: user ${me.id} cannot update campaign ${id}`);
          return;
        }

        // FINANCIAL VERSIONING: Block CPM and maxPayoutPerClip changes when
        // the campaign already has submissions. Creators must start a new
        // campaign version for different financial terms.
        const FINANCIAL_FIELDS = ["payout", "maxPayoutPerClip"] as const;
        const hasClips = stateRef.current.clips.some((k) => k.campaignId === id);
        if (hasClips) {
          for (const field of FINANCIAL_FIELDS) {
            if (field in patch && patch[field] !== camp?.[field]) {
              console.error(
                `Financial lock: cannot change ${field} on campaign "${camp?.title}" — ` +
                  `campaign has existing submissions. Create a new campaign with the updated terms.`,
              );
              // Strip the blocked field from the patch
              const { [field]: _removed, ...rest } = patch as Record<string, unknown>;
              patch = rest as Partial<Campaign>;
            }
          }
        }
        const prevCampaigns = stateRef.current.campaigns;
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
        if (!isSupabaseConfigured) return;
        const update: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          const col = CAMPAIGN_DB_MAP[k];
          if (col) update[col] = (v as unknown) ?? null;
        }
        const currentCamp = stateRef.current.campaigns.find((c) => c.id === id);
        update.audit = currentCamp?.audit ?? [];
        const { error } = await supabase.from("campaigns").update(update).eq("id", id);
        if (error) {
          console.error("Campaign update failed:", error.message);
          setState((s) => ({ ...s, campaigns: prevCampaigns, lastError: `Campaign update failed: ${error.message}` }));
        }
      },

      updateProfileStatus: async (id, status, actor, reason) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error("Authorization: non-admin cannot update profile status");
          return;
        }
        if (!isSupabaseConfigured) return;
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: status === "suspended" ? "suspend" : "reactivate",
          p_reason: reason,
        });
        if (error) {
          console.error("RPC admin_user_action failed:", error.message);
          setState((s) => ({ ...s, lastError: `User status update failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id
              ? { ...p, status: status as ProfileStatus, suspendedReason: status === "suspended" ? reason : undefined }
              : p,
          ),
        }));
      },

      verifyProfile: async (id, actor, verified) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error("Authorization: non-admin cannot verify profiles");
          return;
        }
        if (!isSupabaseConfigured) return;
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: verified ? "verify" : "unverify",
        });
        if (error) {
          console.error("RPC admin_user_action failed:", error.message);
          setState((s) => ({ ...s, lastError: `Verification update failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id
              ? { ...p, verified, verifiedAt: verified ? Date.now() : undefined }
              : p,
          ),
        }));
      },

      setProfileRisk: async (id, actor, flagged, note) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error("Authorization: non-admin cannot set risk flags");
          return;
        }
        if (!isSupabaseConfigured) return;
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: flagged ? "set_risk" : "clear_risk",
          p_details: note,
        });
        if (error) {
          console.error("RPC admin_user_action failed:", error.message);
          setState((s) => ({ ...s, lastError: `Risk flag update failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id
              ? { ...p, riskFlag: flagged, riskNote: note }
              : p,
          ),
        }));
      },

      saveAdminNotes: async (id, notes, _actor) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error("Authorization: non-admin cannot save admin notes");
          return;
        }
        if (!isSupabaseConfigured) return;
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: "save_notes",
          p_details: notes,
        });
        if (error) {
          console.error("RPC admin_user_action failed:", error.message);
          setState((s) => ({ ...s, lastError: `Admin notes save failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id ? { ...p, adminNotes: notes } : p,
          ),
        }));
      },

      respondToAppeal: (id, appealId, response, status, actor) => {
        const profile = stateRef.current.profiles.find((p) => p.id === id);
        if (!profile?.appeals) return;
        const appeals = profile.appeals.map((a) =>
          a.id === appealId ? { ...a, status, response, at: a.at } : a,
        );
        adminProfilePatch(id, { appeals }, actor, "appeal_response", response);
      },

      deleteProfile: async (id) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error(`Authorization: user ${me?.id ?? "anonymous"} cannot delete profile ${id}`);
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }));
          return;
        }
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: "delete",
        });
        if (error) {
          console.error("RPC admin_user_action (delete) failed:", error.message);
          setState((s) => ({ ...s, lastError: `User deletion failed: ${error.message}` }));
          return;
        }
        setState((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== id) }));
      },

      deactivateProfile: async (id, reason) => {
        const me = await getCurrentUser();
        if (!me || !await isUserAdmin(me.id)) {
          console.error(`Authorization: user ${me?.id ?? "anonymous"} cannot deactivate profile ${id}`);
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            profiles: s.profiles.map((p) =>
              p.id === id
                ? { ...p, status: "deactivated" as const, deactivatedAt: new Date().toISOString(), deactivatedBy: me.id }
                : p,
            ),
          }));
          return;
        }
        const { error } = await supabase.rpc("admin_user_action", {
          p_user_id: id,
          p_action: "deactivate",
          p_reason: reason,
        });
        if (error) {
          console.error("RPC admin_user_action (deactivate) failed:", error.message);
          setState((s) => ({ ...s, lastError: `User deactivation failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === id
              ? { ...p, status: "deactivated" as const, deactivatedAt: new Date().toISOString(), deactivatedBy: me.id }
              : p,
          ),
        }));
      },

      deactivateOwnAccount: async () => {
        const me = await getCurrentUser();
        if (!me) {
          console.error("Not authenticated");
          return;
        }
        if (!isSupabaseConfigured) {
          setState((s) => ({
            ...s,
            profiles: s.profiles.map((p) =>
              p.id === me.id
                ? { ...p, status: "deactivated" as const, deactivatedAt: new Date().toISOString() }
                : p,
            ),
          }));
          return;
        }
        const { error } = await supabase.rpc("deactivate_own_account");
        if (error) {
          console.error("RPC deactivate_own_account failed:", error.message);
          setState((s) => ({ ...s, lastError: `Account deactivation failed: ${error.message}` }));
          return;
        }
        setState((s) => ({
          ...s,
          profiles: s.profiles.map((p) =>
            p.id === me.id
              ? { ...p, status: "deactivated" as const, deactivatedAt: new Date().toISOString() }
              : p,
          ),
        }));
      },

      updateProfile: async (id, patch) => {
        // SECURITY: Users can only update their own profile. Admins can update any.
        // SECURITY: Privileged fields (role, status, verified, risk_flag, admin_notes)
        // must only be changed via adminProfilePatch, never via updateProfile.
        const me = await getCurrentUser();
        if (me && me.id !== id && !await isUserAdmin(me.id)) {
          console.error(`Authorization: user ${me.id} cannot update profile ${id}`);
          return;
        }
        // Block non-admins from setting privileged fields
        if (me && !await isUserAdmin(me.id)) {
          const { role, status, verified, verifiedAt, riskFlag, riskNote, adminNotes, suspendedReason, appeals, audit, ...safe } = patch as Record<string, unknown>;
          void role; void status; void verified; void verifiedAt; void riskFlag; void riskNote; void adminNotes; void suspendedReason; void appeals; void audit;
          Object.assign(patch, safe);
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
        const prevProfiles = stateRef.current.profiles;
        const dbPatch: Record<string, unknown> = {};
        if (patch.name !== undefined) dbPatch.name = patch.name;
        if (patch.upi !== undefined) dbPatch.upi = patch.upi;
        if (patch.bio !== undefined) dbPatch.bio = patch.bio;
        if (patch.company !== undefined) dbPatch.company = patch.company;
        if (patch.team !== undefined) dbPatch.team = patch.team;
        if (patch.username !== undefined) dbPatch.username = patch.username;
        const { error } = await supabase
          .from("profiles")
          .update(dbPatch)
          .eq("id", id);
        if (error) {
          console.error("Profile update failed:", error.message);
          setState((s) => ({ ...s, profiles: prevProfiles, lastError: `Profile update failed: ${error.message}` }));
        }
      },

      addSocialAccount: (a) => {
        // SECURITY: Only manages local React state for optimistic UI.
        // Database persistence happens server-side through the OAuth flow:
        //   - OAuth initiate → creates state record (service-role)
        //   - OAuth callback → creates/updates social_accounts + social_connections (service-role)
        // Direct client INSERT to social_accounts is forbidden by RLS.
        const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const record: SocialAccount = {
          id,
          userId: a.userId,
          platform: a.platform,
          handle: a.handle,
          providerAccountId: a.providerAccountId,
          avatarUrl: a.avatarUrl,
          status: a.status,
          verified: a.verified,
          connectedAt: a.connectedAt,
          lastSyncAt: a.lastSyncAt,
          error: a.error,
        };
        setState((s) => ({ ...s, socialAccounts: [...s.socialAccounts, record] }));
        return id;
      },

      updateSocialAccount: async (id, patch) => {
        // SECURITY: Only manages local React state for optimistic UI.
        // Database persistence happens server-side:
        //   - OAuth callback → updates social_accounts (service-role)
        //   - Disconnect API → updates status (service-role)
        //   - Verify API → updates verified fields (service-role)
        // Direct client UPDATE to social_accounts is forbidden by RLS
        // for trusted fields (verified, provider_account_id, status).
        setState((s) => ({
          ...s,
          socialAccounts: s.socialAccounts.map((acc) =>
            acc.id === id ? { ...acc, ...patch } : acc,
          ),
        }));
      },

      setSiteSettings: async (site) => {
        const prevSettings = stateRef.current.siteSettings;
        setState((s) => ({ ...s, siteSettings: site }));
        if (!isSupabaseConfigured) return;
        const { error } = await supabase
          .from("site_settings")
          .upsert({
            id: 1,
            hero_title: site.heroTitle,
            hero_subtitle: site.heroSubtitle,
            featured_ids: site.featuredIds,
          });
        if (error) {
          console.error("Site settings save failed:", error.message);
          setState((s) => ({ ...s, siteSettings: prevSettings, lastError: `Settings save failed: ${error.message}` }));
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

// Calculate per-clipper reputation metrics from clips and finance records
export function calculateClipperReputation(clips: Clip[], userId: string, campaigns: Campaign[], financeRecords: FinanceRecord[], socialAccounts?: { verified?: boolean }[]): {
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
  
  const totalApproved = clipperClips.filter((k) => k.status === "approved" || k.status === "held").length;
  const totalRejected = clipperClips.filter((k) => k.status === "rejected").length;
  const approvalRate = totalApproved > 0 ? (totalApproved / (totalApproved + totalRejected) * 100) : 0;
  
  const verifiedClips = clipperClips.filter((k) => k.status === "approved");
  const totalVerifiedViews = verifiedClips.reduce((sum, k) => sum + k.views, 0);
  
  const successfulCampaigns = new Set(
    clipperClips.map((k) => k.campaignId)
  ).size;
  
  const totalEarned = financeOf(financeRecords, (r) => r.clipperId === userId).total;
  
  const completedPayouts = financeRecords.filter((r) => r.clipperId === userId && r.status === "paid").length;
  
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
export function getClipperReputation(clips: Clip[], userId: string, campaigns: Campaign[], financeRecords: FinanceRecord[], socialAccounts?: { verified?: boolean }[]) {
  const metrics = calculateClipperReputation(clips, userId, campaigns, financeRecords, socialAccounts);
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

