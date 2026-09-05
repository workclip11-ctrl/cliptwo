import type { Campaign, Clip } from "./types";
import { clipEarnings } from "./format";

export interface SeriesPoint {
  label: string;
  value: number;
}

export function creatorReceived(
  clips: Clip[],
  campaigns: Campaign[],
  userId?: string,
): Clip[] {
  const myCampaignIds = new Set(
    campaigns
      .filter((c) => c.created_by && c.created_by === userId)
      .map((c) => c.id),
  );
  return clips.filter((k) => myCampaignIds.has(k.campaignId));
}

export interface Overview {
  totalVerifiedViews: number;
  totalClips: number;
  activeClippers: number;
  totalSpend: number;
  avgCPM: number | null;
  totalEngagement: number | null;
  remainingBudget: number;
  totalBudget: number;
}

export function analyticsOverview(
  received: Clip[],
  campaigns: Campaign[],
  myCampaigns: Campaign[],
): Overview {
  const totalVerifiedViews = received.reduce((s, k) => s + (k.verifiedViews ?? 0), 0);
  const totalClips = received.length;
  const clipperSet = new Set(received.map((k) => k.userId ?? k.clipper));
  const activeClippers = clipperSet.size;
  const totalSpend = received.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const avgCPM =
    totalVerifiedViews > 0 && totalSpend > 0
      ? totalSpend / (totalVerifiedViews / 1000)
      : null;
  const engTotal = received.reduce((s, k) => {
    if (!k.engagement) return s;
    return (
      s +
      (k.engagement.likes ?? 0) +
      (k.engagement.comments ?? 0) +
      (k.engagement.shares ?? 0)
    );
  }, 0);
  const totalEngagement = engTotal > 0 ? engTotal : null;
  const totalBudget = myCampaigns.reduce((s, c) => s + (c.budget ?? 0), 0);
  const remainingBudget = Math.max(0, totalBudget - totalSpend);
  return {
    totalVerifiedViews,
    totalClips,
    activeClippers,
    totalSpend,
    avgCPM,
    totalEngagement,
    remainingBudget,
    totalBudget,
  };
}

function dayKey(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

// Builds a continuous daily series from the earliest submission to today.
export function seriesByDay(
  received: Clip[],
  valueFn: (k: Clip) => number,
): SeriesPoint[] {
  if (received.length === 0) return [];
  const start = new Date(Math.min(...received.map((k) => k.submittedAt)));
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const map = new Map<string, number>();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const k of received) {
    const key = dayKey(k.submittedAt);
    map.set(key, (map.get(key) ?? 0) + valueFn(k));
  }
  return [...map.entries()].map(([key, value]) => ({
    label: fmtDay(key),
    value,
  }));
}

export function viewsByPlatform(received: Clip[]): SeriesPoint[] {
  const m = new Map<string, number>();
  for (const k of received) {
    const p = k.platform ?? "Other";
    m.set(p, (m.get(p) ?? 0) + (k.verifiedViews ?? 0));
  }
  return [...m.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function spendByCampaign(
  received: Clip[],
  campaigns: Campaign[],
): Array<{ id: string; label: string; value: number }> {
  const m = new Map<string, number>();
  for (const k of received) {
    m.set(k.campaignId, (m.get(k.campaignId) ?? 0) + clipEarnings(k, campaigns));
  }
  return [...m.entries()]
    .map(([id, value]) => {
      const c = campaigns.find((x) => x.id === id);
      return { id, label: c?.title ?? "Unknown campaign", value };
    })
    .sort((a, b) => b.value - a.value);
}

export function topClips(received: Clip[], n = 10): Clip[] {
  return [...received].sort((a, b) => (b.verifiedViews ?? 0) - (a.verifiedViews ?? 0)).slice(0, n);
}

export interface TopClipper {
  handle: string;
  views: number;
  earned: number;
}

export function topClippers(received: Clip[], campaigns: Campaign[], n = 8): TopClipper[] {
  const m = new Map<string, TopClipper>();
  for (const k of received) {
    const key = k.userId ?? k.clipper;
    const cur = m.get(key) ?? { handle: k.clipper, views: 0, earned: 0 };
    cur.views += (k.verifiedViews ?? 0);
    cur.earned += clipEarnings(k, campaigns);
    m.set(key, cur);
  }
  return [...m.values()].sort((a, b) => b.views - a.views).slice(0, n);
}

// Actual CPM for an earned clip; falls back to the campaign's agreed rate
// (never a fabricated number) when the clip hasn't earned yet.
export function clipCPM(k: Clip, campaigns: Campaign[]): number {
  const camp = campaigns.find((c) => c.id === k.campaignId);
  const earned = clipEarnings(k, campaigns);
  if (earned > 0 && (k.verifiedViews ?? 0) > 0) return earned / ((k.verifiedViews ?? 0) / 1000);
  return camp?.payout ?? 0;
}
