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
  Clip,
  ClipStatus,
  Platform,
  StoreState,
} from "./types";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

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
      const [{ data: camps }, { data: clps }] = await Promise.all([
        supabase.from("campaigns").select("*"),
        supabase.from("clips").select("*"),
      ]);
      if (!active) return;
      if (camps) setState((s) => ({ ...s, campaigns: camps.map(mapCampaign) }));
      if (clps) setState((s) => ({ ...s, clips: clps.map(mapClip) }));
    })().catch(() => {
      /* keep seed on failure */
    });

    return () => {
      active = false;
    };
  }, []);

  const actions = useMemo<StoreActions>(
    () => ({
      addCampaign: (c) => {
        const optimistic: Campaign = {
          ...c,
          id: `c${Date.now()}`,
          createdAt: Date.now(),
          status: "open",
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
              status: "open",
              source_link: c.sourceLink ?? null,
              rules: c.rules ?? null,
              created_by: u.user?.id ?? null,
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

      setClipStatus: (id, status) => {
        setState((s) => ({
          ...s,
          clips: s.clips.map((k) => (k.id === id ? { ...k, status } : k)),
        }));
        if (!isSupabaseConfigured) return;
        ignore(supabase.from("clips").update({ status }).eq("id", id));
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
