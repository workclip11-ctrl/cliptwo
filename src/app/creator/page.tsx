"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  Film,
  Clock,
  Wallet,
  Plus,
  Sparkles,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { PlatformIcon } from "@/components/PlatformIcon";
import { NewCampaignModal } from "@/components/NewCampaignModal";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews } from "@/lib/format";
import { financeOf, campaignSpent } from "@/lib/finance";
import type { Campaign, Clip, Platform } from "@/lib/types";

export default function CreatorPage() {
  const { campaigns, clips, addCampaign, financeRecords } = useStore();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const received = clips.filter((k) => myCampaignIds.has(k.campaignId));
  const fin = financeOf(financeRecords, (r) => myCampaignIds.has(r.campaignId));
  const pending = received.filter((k) => k.status === "pending");
  const pendingCount = fin.pendingCount;
  const totalSpent = fin.paid / 100;
  const totalEarned = fin.total / 100;
  const outstanding = fin.pending / 100;

  const topClips = [...received]
    .filter((k) => k.status === "approved" || k.status === "held")
    .sort((a, b) => (financeRecords.find((r) => r.clipId === b.id)?.netAmount ?? 0) - (financeRecords.find((r) => r.clipId === a.id)?.netAmount ?? 0))
    .slice(0, 4);

  return (
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/creator/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={15} /> Create campaign
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            Quick add
          </button>
          <Link
            href="/creator/analytics"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            <BarChart3 size={15} /> Analytics
          </Link>
        </div>
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
          value={String(pendingCount)}
          hint="Awaiting decision"
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Paid out"
          value={rup(totalSpent)}
          icon={<Wallet size={16} />}
        />
      </div>

      {/* Recent campaigns + pending review */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Recent campaigns
            </h2>
            <Link
              href="/creator/campaigns"
              className="text-xs font-medium text-accent hover:underline underline-offset-2"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {myCampaigns.slice(0, 3).map((c) => (
                <CampaignRow
                  key={c.id}
                  c={c}
                  clips={clips}
                  financeRecords={financeRecords}
                  onOpen={() => setSelected(c)}
                />
            ))}
            {myCampaigns.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">
                No campaigns yet.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Pending review
            </h2>
            <Link
              href="/creator/submissions"
              className="text-xs font-medium text-accent hover:underline underline-offset-2"
            >
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {pending.slice(0, 3).map((k) => {
              const camp = campaigns.find((c) => c.id === k.campaignId);
              return (
                <div key={k.id} className="rounded-xl border bg-card p-4">
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
      </div>

      {/* Top clips + payout summary */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Top clips
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-sm">
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
                    {fmtViews(k.verifiedViews ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {rup((financeRecords.find((r) => r.clipId === k.id)?.netAmount ?? 0) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
               {topClips.length === 0 && (
                <p className="p-6 text-center text-sm text-muted">
                  No earned clips yet.
                </p>
              )}
        </div>

        <div className="mt-4 rounded-2xl border bg-foreground p-5 text-white">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-white/70" />
            <p className="text-sm font-medium">Payout summary</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="font-mono text-lg font-medium">{rup(totalEarned)}</p>
              <p className="text-[11px] text-white/50">total earned</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="font-mono text-lg font-medium">{rup(totalSpent)}</p>
              <p className="text-[11px] text-white/50">paid out</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="font-mono text-lg font-medium">{rup(outstanding)}</p>
              <p className="text-[11px] text-white/50">outstanding</p>
            </div>
          </div>
        </div>
      </section>

      {open && (
        <NewCampaignModal
          onClose={() => setOpen(false)}
          onSubmit={(title, brief, platform, payout, niche, budget, sourceLink, extra) => {
            addCampaign({
              title,
              creator: user?.name ?? user?.email ?? "Creator",
              created_by: user?.id,
              brief,
              platform: platform as Platform,
              payout,
              niche,
              budget,
              sourceLink: sourceLink || undefined,
              spent: 0,
              daysLeft: 30,
              category: niche,
              platforms: extra.platforms,
              objective: extra.objective || undefined,
              maxPayoutPerClip: extra.maxPayoutPerClip || undefined,
              recommendedDuration: extra.recommendedDuration || undefined,
              aspectRatio: extra.aspectRatio || undefined,
              cta: extra.cta || undefined,
              hook: extra.hook || undefined,
              branding: extra.branding || undefined,
              startDate: new Date().toISOString().slice(0, 10),
              endDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
            });
            setOpen(false);
          }}
        />
      )}

      {selected && (
        <CampaignDetailModal
          campaign={selected}
          clips={clips}
          financeRecords={financeRecords}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CampaignRow({
  c,
  clips,
  financeRecords,
  onOpen,
}: {
  c: Campaign;
  clips: Clip[];
  financeRecords: import("@/lib/types").FinanceRecord[];
  onOpen: () => void;
}) {
  const campClips = clips.filter((k) => k.campaignId === c.id);
  const spent = campaignSpent(c, financeRecords);
  const pct = c.budget ? Math.min(100, Math.round((spent / c.budget) * 100)) : 0;
  const isOpen = c.status === "open";
  const isArchived = c.status === "archived";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`block w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/30 ${isArchived ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        {c.thumbnails?.[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={c.thumbnails[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg border object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-medium">{c.title}</p>
          <p className="truncate text-xs text-muted">
            {c.niche} · {c.platform}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            isArchived
              ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
              : isOpen
                ? "border-green/20 bg-green/10 text-green"
                : "border-muted/20 bg-accent-soft text-muted"
          }`}
        >
          {isArchived ? "Archived" : isOpen ? "Open" : "Closed"}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {campClips.length} clips · {c.daysLeft}d left · {rup(spent)} spent
      </p>
    </button>
  );
}

function CampaignDetailModal({
  campaign,
  clips,
  financeRecords,
  onClose,
}: {
  campaign: Campaign;
  clips: Clip[];
  financeRecords: import("@/lib/types").FinanceRecord[];
  onClose: () => void;
}) {
  const campClips = clips.filter((k) => k.campaignId === campaign.id);
  const approvedN = campClips.filter((k) => k.status === "approved").length;
  const pendingN = campClips.filter((k) => k.status === "pending").length;
  const spent = campaignSpent(campaign, financeRecords);
  const pct = campaign.budget
    ? Math.min(100, Math.round((spent / campaign.budget) * 100))
    : 0;
  const remaining = (campaign.budget ?? 0) - spent;
  const isOpen = campaign.status === "open";

  return (
    <div
      className="fixed inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{campaign.title}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {campaign.creator} · {campaign.niche} · {campaign.platform}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              isOpen
                ? "border-green/20 bg-green/10 text-green"
                : "border-muted/20 bg-accent-soft text-muted"
            }`}
          >
            {isOpen ? "Open" : "Closed"}
          </span>
        </div>

        {campaign.thumbnails?.[0] && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={campaign.thumbnails[0]} alt="" className="mt-3 h-24 w-40 rounded-lg border object-cover" />
        )}

        <p className="mt-3 text-sm text-muted">{campaign.brief}</p>

        {campaign.sourceLink && (
          <div className="mt-4">
            <p className="text-xs text-muted">Video resource</p>
            {/^https?:\/\//i.test(campaign.sourceLink) ? (
              <a
                href={campaign.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline underline-offset-2"
              >
                <Film size={14} /> Open source video
              </a>
            ) : (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted">
                <Film size={14} /> {campaign.sourceLink}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
            <span>{rup(spent)} spent</span>
            <span>{rup(remaining)} left</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Sparkles size={13} /> {campClips.length} clips
          </span>
          <span className="text-green">● {approvedN} approved</span>
          <span className="text-amber">● {pendingN} pending</span>
          <span className="inline-flex items-center gap-1">
            <Sparkles size={12} /> {campaign.daysLeft} days left
          </span>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
        >
          Close
        </button>
      </div>
    </div>
  );
}
