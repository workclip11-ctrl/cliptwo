"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Play,
  Eye,
  IndianRupee,
  Search,
  ChevronDown,
  Inbox,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import type { ClipStatus } from "@/lib/types";

const FILTERS: Array<{ key: ClipStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "held", label: "Held" },
];

function fmtDate(t: number) {
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CreatorSubmissionsPage() {
  const { campaigns, clips, profiles, socialAccounts } = useStore();
  const { user } = useAuth();
  useAutoRefresh();
  const [filter, setFilter] = useState<ClipStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [rulesId, setRulesId] = useState<string | null>(null);

  const myCampaigns = campaigns.filter(
    (c) => c.created_by && c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const all = clips.filter((k) => myCampaignIds.has(k.campaignId));

  const filtered = all.filter((k) => {
    if (filter !== "all") {
      if (filter === "approved") {
        if (!["approved", "held"].includes(k.status)) return false;
      } else if (k.status !== filter) {
        return false;
      }
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const camp = campaigns.find((c) => c.id === k.campaignId);
      return (
        k.clipper.toLowerCase().includes(q) ||
        k.caption.toLowerCase().includes(q) ||
        (camp?.title.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const count = (s: ClipStatus) => all.filter((k) => k.status === s).length;
  const approvedCount = all.filter(
    (k) => k.status === "approved" || k.status === "held",
  ).length;

  return (
    <div className="mx-auto max-w-[1120px] space-y-10 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
          Submissions
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Review every clip submitted to your campaigns.
        </p>
      </div>

      {/* ── Summary ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <SummaryItem value={all.length} label="Total" />
        <SummaryItem value={count("pending")} label="Awaiting review" />
        <SummaryItem value={approvedCount} label="Approved" />
        <SummaryItem value={count("rejected")} label="Rejected" />
      </div>

      {/* ── Search + Filters ────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by clipper, caption, or campaign"
            className="h-11 w-full rounded-[10px] border border-border/60 bg-card pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-foreground/30"
          />
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-[10px] px-4 text-[13px] font-medium transition-colors duration-150 ${
                filter === f.key
                  ? "bg-accent text-white"
                  : "border border-border/60 bg-card text-muted hover:border-foreground/20 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card p-8 text-center">
          <p className="text-[15px] font-medium text-foreground">
            {all.length === 0
              ? "No submissions yet"
              : "No submissions match this filter"}
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {all.length === 0
              ? "Clips submitted to your campaigns will appear here."
              : "Try adjusting your search or filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((k) => {
            const camp = campaigns.find((c) => c.id === k.campaignId);
            const prof = profiles.find((p) => p.id === k.userId);
            const connected = socialAccounts.filter(
              (sa) => sa.handle === `@${k.clipper}`,
            );
            const payout = clipEarnings(k, campaigns);
            const eng = k.engagement;
            const open = rulesId === k.id;

            return (
              <article
                key={k.id}
                className="overflow-hidden rounded-[12px] border border-border/40 bg-card"
              >
                {/* ── Main row: media + info ─────────────── */}
                <div className="flex flex-col sm:flex-row">
                  {/* Media */}
                  <a
                    href={k.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative flex h-40 shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-accent-soft sm:h-auto sm:w-[240px]"
                  >
                    <Play
                      size={28}
                      className="z-10 text-foreground/30 transition-transform duration-200 group-hover:scale-110 group-hover:text-foreground/50"
                    />
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5 rounded-[6px] bg-background/80 px-2 py-1 text-[11px] font-medium backdrop-blur">
                      <PlatformIcon p={k.platform ?? "Instagram"} size={12} />
                      {k.platform}
                    </div>
                  </a>

                  {/* Info */}
                  <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
                    {/* Top: status + caption */}
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/clip/${k.id}`}
                        className="min-w-0 cursor-pointer text-[15px] font-semibold leading-snug hover:underline underline-offset-2 sm:text-[16px]"
                      >
                        {k.caption}
                      </Link>
                      <StatusPill status={k.status} />
                    </div>

                    {/* Clipper */}
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="font-medium text-foreground">
                        @{k.clipper}
                      </span>
                      {prof?.name && (
                        <span className="text-muted">{prof.name}</span>
                      )}
                      {connected.length > 0 && (
                        <span className="flex items-center gap-1">
                          {connected.map((sa) => (
                            <PlatformIcon
                              key={sa.id}
                              p={sa.platform}
                              size={12}
                            />
                          ))}
                        </span>
                      )}
                    </div>

                    {/* Campaign */}
                    {camp && (
                      <Link
                        href={`/creator/campaigns/${camp.id}`}
                        className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-foreground"
                      >
                        {camp.title}
                        <ExternalLink size={11} />
                      </Link>
                    )}

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-muted">
                      <span>{fmtDate(k.submittedAt)}</span>
                      <span className="flex items-center gap-1">
                        <Eye size={13} />
                        {fmtViews(k.verifiedViews ?? 0)}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <IndianRupee size={13} />
                        {rup(payout)}
                      </span>
                      {eng && (
                        <span className="flex items-center gap-3">
                          {eng.likes != null && (
                            <span className="inline-flex items-center gap-1">
                              <Heart size={12} />
                              {fmtViews(eng.likes)}
                            </span>
                          )}
                          {eng.comments != null && (
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle size={12} />
                              {fmtViews(eng.comments)}
                            </span>
                          )}
                          {eng.shares != null && (
                            <span className="inline-flex items-center gap-1">
                              <Share2 size={12} />
                              {fmtViews(eng.shares)}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Rules toggle ───────────────────────── */}
                {camp?.rules && (
                  <div className="border-t border-border/40 px-4 sm:px-5">
                    <button
                      onClick={() => setRulesId(open ? null : k.id)}
                      className="flex w-full cursor-pointer items-center gap-1.5 py-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
                    >
                      View campaign rules
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                )}

                {/* ── Expanded rules ─────────────────────── */}
                {open && (
                  <div className="border-t border-border/40 bg-accent-soft/30 px-4 py-4 sm:px-5">
                    <p className="mb-1.5 text-[13px] font-medium">
                      Campaign rules
                    </p>
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">
                      {camp?.rules}
                    </p>
                    {k.rejectionReason && (
                      <div className="mt-3 border-t border-border/40 pt-3">
                        <p className="mb-0.5 text-[13px] font-medium text-red">
                          Rejection reason
                        </p>
                        <p className="text-[13px] text-muted">
                          {k.rejectionReason}
                          {k.rejectionDetails
                            ? ` — ${k.rejectionDetails}`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryItem({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <div>
      <span className="font-mono text-[22px] font-bold tracking-tight">
        {value}
      </span>
      <span className="ml-2 text-[13px] text-muted">{label}</span>
    </div>
  );
}
