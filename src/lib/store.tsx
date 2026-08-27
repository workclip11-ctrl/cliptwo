"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Campaign, Clip, ClipStatus, StoreState } from "./types";

const STORAGE_KEY = "cliptwo-store-v1";

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
      budget: 40000,
      spent: 4048,
      daysLeft: 12,
      sourceLink: "https://drive.google.com/drive/folders/launch-teaser",
      rules: "Cut a 20s hook from the keynote. Punchy, fast-paced, end on CTA. No watermarks.",
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
      budget: 25000,
      spent: 1920,
      daysLeft: 26,
      sourceLink: "https://drive.google.com/drive/folders/workout-routine",
      rules: "Turn the 12-min session into 3 separate 30s reels. Vertical only. Upbeat music.",
    },
    {
      id: "c3",
      title: "Founder story short",
      creator: "Maker House",
      brief: "Use the intro monologue. Emotional, cinematic, subtitles on.",
      platform: "YouTube",
      payout: 280,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 6,
      niche: "Finance",
      budget: 60000,
      spent: 0,
      daysLeft: 9,
      sourceLink: "https://drive.google.com/drive/folders/founder-story",
      rules: "Vertical 9:16 only. Keep the monologue intact. English subtitles required.",
    },
    {
      id: "c4",
      title: "Stand-up Set — Delhi Live",
      creator: "Kabir Sethi",
      brief: "Punchline-first cuts, 20-40s max. Keep crowd reactions in.",
      platform: "Reels",
      payout: 190,
      status: "open",
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
      niche: "Comedy",
      budget: 30000,
      spent: 0,
      daysLeft: 14,
      sourceLink: "https://drive.google.com/drive/folders/delhi-live",
      rules: "No profanity in captions. 20-40s clips. Add a hook in the first 3 seconds.",
    },
  ],
  clips: [
    {
      id: "k1",
      campaignId: "c1",
      clipper: "maya.cuts",
      videoUrl: "https://instagram.com/reel/xk29a",
      caption: "This app is unhinged 🔥 #tech",
      status: "approved",
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
  ],
};

interface StoreActions {
  addCampaign: (c: Omit<Campaign, "id" | "createdAt" | "status">) => void;
  addClip: (k: Omit<Clip, "id" | "submittedAt" | "status" | "views">) => void;
  setClipStatus: (id: string, status: ClipStatus) => void;
  closeCampaign: (id: string) => void;
}

const StoreContext = createContext<(StoreState & StoreActions) | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(seed);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const actions = useMemo<StoreActions>(
    () => ({
      addCampaign: (c) =>
        setState((s) => ({
          ...s,
          campaigns: [
            {
              ...c,
              id: `c${Date.now()}`,
              createdAt: Date.now(),
              status: "open",
            },
            ...s.campaigns,
          ],
        })),
      addClip: (k) =>
        setState((s) => ({
          ...s,
          clips: [
            {
              ...k,
              id: `k${Date.now()}`,
              submittedAt: Date.now(),
              status: "pending",
              views: 0,
            },
            ...s.clips,
          ],
        })),
      setClipStatus: (id, status) =>
        setState((s) => ({
          ...s,
          clips: s.clips.map((k) => (k.id === id ? { ...k, status } : k)),
        })),
      closeCampaign: (id) =>
        setState((s) => ({
          ...s,
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, status: "closed" } : c,
          ),
        })),
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
