"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Film,
  Clock,
  Wallet,
  Plus,
  Check,
  Ban,
  TrendingUp,
  Sparkles,
  BadgeCheck,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { Campaign, Clip, Platform } from "@/lib/types";

const PLATFORMS: Platform[] = ["TikTok", "YouTube", "Instagram", "Reels"];
const NICHES = ["Tech", "Gaming", "Finance", "Comedy", "Fitness", "Podcast"];

function rup(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
function fmtViews(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}
function clipEarnings(clip: Clip, campaigns: Campaign[]) {
  if (clip.status !== "approved") return 0;
  const camp = campaigns.find((c) => c.id === clip.campaignId);
  return camp ? (clip.views / 1000) * camp.payout : 0;
}

export default function CreatorPage() {
  const { campaigns, clips, addCampaign, setClipStatus, closeCampaign } =
    useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const pending = received.filter((k) => k.status === "pending");
  const approvedClips = received.filter((k) => k.status === "approved");
  const totalSpent = received.reduce((s, k) => s + clipEarnings(k, campaigns), 0);
  const avgCPM =
    approvedClips.length > 0
      ? Math.round(
          approvedClips.reduce(
            (s, k) => s + (campaigns.find((c) => c.id === k.campaignId)?.payout ?? 0),
            0,
          ) / approvedClips.length,
        )
      : 0;

  const topClips = [...approvedClips]
    .sort((a, b) => b.views - a.views)
    .slice(0, 4);

  return (
    <>
      <div className="space-y-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-base font-semibold text-white">
              {(user?.name ?? "C").trim().charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {user?.name ?? user?.email ?? "Creator"}
              </h1>
              <p className="text-sm text-muted">Creator dashboard</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={15} /> New campaign
          </button>
        </div>

        {/* KPIs */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Active campaigns"
            value={String(myCampaigns.filter((c) => c.status === "open").length)}
            icon={<LayoutGrid size={16} />}
          />
          <StatCard
            label="Clips received"
            value={String(received.length)}
            icon={<Film size={16} />}
          />
          <StatCard
            label="Pending review"
            value={String(pending.length)}
            hint="Awaiting decision"
            icon={<Clock size={16} />}
          />
          <StatCard
            label="Paid out"
            value={rup(totalSpent)}
            hint={`avg CPM ${rup(avgCPM)}`}
            icon={<Wallet size={16} />}
          />
        </div>

        {/* Campaigns */}
        <section id="campaigns" className="mt-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Your campaigns
          </h2>
          <div className="space-y-4">
            {myCampaigns.map((c) => {
              const campClips = clips.filter((k) => k.campaignId === c.id);
              const approvedN = campClips.filter((k) => k.status === "approved").length;
              const pendingN = campClips.filter((k) => k.status === "pending").length;
              const pct = c.budget
                ? Math.min(100, Math.round(((c.spent ?? 0) / c.budget) * 100))
                : 0;
              const remaining = (c.budget ?? 0) - (c.spent ?? 0);
              return (
                <div key={c.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/campaign/${c.id}`}
                          className="font-semibold hover:underline underline-offset-2"
                        >
                          {c.title}
                        </Link>
                        {c.status === "closed" && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-muted">
                            Closed
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {c.creator} · {c.niche} · {c.platform}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-medium text-amber">
                        {rup(c.payout)}
                      </p>
                      <p className="text-[11px] text-muted">per 1K views</p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-muted">{c.brief}</p>

                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                      <span>{rup(c.spent ?? 0)} spent</span>
                      <span>{rup(remaining)} left</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Film size={13} /> {campClips.length} clips
                      </span>
                      <span className="text-green">● {approvedN} approved</span>
                      <span className="text-amber">● {pendingN} pending</span>
                      <span className="inline-flex items-center gap-1">
                        <Sparkles size={12} /> {c.daysLeft} days left
                      </span>
                    </div>
                    {c.status === "open" && (
                      <button
                        onClick={() => closeCampaign(c.id)}
                        className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
                      >
                        Close campaign
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Review queue + top clips */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section id="review">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Review queue
            </h2>
            <div className="space-y-3">
              {pending.map((k) => {
                const camp = campaigns.find((c) => c.id === k.campaignId);
                return (
                  <div
                    key={k.id}
                    className="rounded-xl border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/clip/${k.id}`}
                          className="truncate text-sm font-medium hover:underline underline-offset-2"
                        >
                          @{k.clipper}
                        </Link>
                        <p className="truncate text-xs text-muted">{camp?.title}</p>
                        <p className="mt-1 truncate text-xs text-muted">{k.caption}</p>
                      </div>
                      <span className="text-muted">
                        {k.platform ? <PlatformIcon p={k.platform} size={15} /> : null}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setClipStatus(k.id, "approved")}
                        className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2.5 py-1 text-xs font-medium text-green"
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        onClick={() => setClipStatus(k.id, "rejected")}
                        className="inline-flex items-center gap-1 rounded-md bg-red/10 px-2.5 py-1 text-xs font-medium text-red"
                      >
                        <Ban size={13} /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
              {pending.length === 0 && (
                <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                  Nothing pending — all clips reviewed.
                </p>
              )}
            </div>
          </section>

          <section id="payouts">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Top clips
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">Clipper</th>
                    <th className="px-4 py-3 text-right font-medium">Views</th>
                    <th className="px-4 py-3 text-right font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topClips.map((k) => (
                    <tr key={k.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/clip/${k.id}`}
                          className="font-medium hover:underline underline-offset-2"
                        >
                          @{k.clipper}
                        </Link>
                        <p className="text-xs text-muted">
                          {campaigns.find((c) => c.id === k.campaignId)?.title}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {fmtViews(k.views)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {rup(clipEarnings(k, campaigns))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topClips.length === 0 && (
                <p className="p-6 text-center text-sm text-muted">
                  No approved clips yet.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border bg-foreground p-5 text-white">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-white/70" />
                <p className="text-sm font-medium">Payout summary</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="font-mono text-lg font-medium">{rup(totalSpent)}</p>
                  <p className="text-[11px] text-white/50">total approved</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="font-mono text-lg font-medium">{approvedClips.length}</p>
                  <p className="text-[11px] text-white/50">paid clips</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {open && (
        <NewCampaignModal
          onClose={() => setOpen(false)}
          onSubmit={(title, brief, platform, payout, niche, budget) => {
            addCampaign({
              title,
              creator: user?.name ?? user?.email ?? "Creator",
              brief,
              platform,
              payout,
              niche,
              budget,
              spent: 0,
              daysLeft: 30,
            });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function NewCampaignModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    title: string,
    brief: string,
    platform: Platform,
    payout: number,
    niche: string,
    budget: number,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [niche, setNiche] = useState(NICHES[0]);
  const [payout, setPayout] = useState("220");
  const [budget, setBudget] = useState("40000");

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">New campaign</h3>
        <p className="mt-1 text-sm text-muted">
          Set your rate and budget — clippers can claim it immediately.
        </p>

        <label className="mt-4 block text-sm font-medium">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Grind Podcast — Ep. 143"
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <label className="mt-4 block text-sm font-medium">Brief</label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="What clippers should focus on, format, tone…"
          className="mt-1 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
        />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {PLATFORMS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Niche</label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            >
              {NICHES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">CPM (₹ / 1K views)</label>
            <input
              type="number"
              min={0}
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Budget (₹)</label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            disabled={!title || !brief}
            onClick={() =>
              onSubmit(
                title,
                brief,
                platform,
                Number(payout) || 0,
                niche,
                Number(budget) || 0,
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <BadgeCheck size={14} /> Fund &amp; launch
          </button>
        </div>
      </div>
    </div>
  );
}
