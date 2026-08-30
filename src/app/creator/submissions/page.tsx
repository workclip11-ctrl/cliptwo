"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  PlayCircle,
  User,
  CalendarDays,
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
import { isEarned } from "@/lib/finance";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import type { ClipStatus } from "@/lib/types";

const FILTERS: Array<{ key: ClipStatus | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "payable", label: "Payable" },
  { key: "processing", label: "Processing" },
  { key: "paid", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "held", label: "Held" },
  { key: "rejected", label: "Rejected" },
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
  const [filter, setFilter] = useState<ClipStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [rulesId, setRulesId] = useState<string | null>(null);

  const myCampaigns = campaigns.filter(
    (c) => !c.created_by || c.created_by === user?.id,
  );
  const myCampaignIds = new Set(myCampaigns.map((c) => c.id));
  const all = clips.filter((k) => myCampaignIds.has(k.campaignId));

  const filtered = all.filter((k) => {
    if (filter !== "all" && k.status !== filter) return false;
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          Review every clip submitted to your campaigns. Payouts and status
          changes are handled by the admin team and logged for audit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Total submissions</p>
          <p className="mt-1 font-mono text-2xl font-semibold">{all.length}</p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Awaiting review</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {count("pending")}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Approved</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {all.filter((k) => isEarned(k.status)).length}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs text-muted">Paid out</p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {count("paid")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clipper, caption or campaign"
            className="w-full rounded-xl border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-foreground/30"
          />
        </div>
        <div className="-mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition ${
                filter === f.key
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card p-12 text-center text-muted">
          <Inbox size={26} />
          <p className="text-sm">
            {all.length === 0
              ? "No submissions to your campaigns yet."
              : "No submissions match this filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
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
                className="overflow-hidden rounded-2xl border bg-card"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row">
                  <a
                    href={k.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-foreground/10 to-foreground/5 sm:w-52"
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <PlayCircle size={34} className="text-foreground/40" />
                    </div>
                    <div className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
                      {k.platform}
                    </div>
                  </a>

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/clip/${k.id}`}
                        className="line-clamp-2 text-sm font-medium hover:underline underline-offset-2"
                      >
                        {k.caption}
                      </Link>
                      <StatusPill status={k.status} />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <PlatformIcon p={k.platform ?? "Instagram"} size={13} />
                      <a
                        href={k.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:text-foreground hover:underline"
                      >
                        {k.videoUrl}
                      </a>
                      <ExternalLink size={11} className="shrink-0" />
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <User size={13} className="shrink-0 text-muted" />
                      <span className="font-medium">@{k.clipper}</span>
                      {prof ? (
                        <span className="text-muted">
                          · {prof.name}
                          {prof.upi ? " · UPI set" : ""}
                        </span>
                      ) : (
                        <span className="text-muted">· profile not synced</span>
                      )}
                      {connected.length > 0 && (
                        <span className="ml-auto flex items-center gap-1">
                          {connected.map((sa) => (
                            <PlatformIcon
                              key={sa.id}
                              p={sa.platform}
                              size={13}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px border-t bg-border/60 sm:grid-cols-4">
                  <Cell label="Submitted">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} className="text-muted" />
                      {fmtDate(k.submittedAt)}
                    </span>
                  </Cell>
                  <Cell label="Verified views">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Eye size={12} className="text-muted" />
                      {fmtViews(k.views)}
                    </span>
                  </Cell>
                  <Cell label="Est. payout">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold">
                      <IndianRupee size={12} className="text-muted" />
                      {rup(payout)}
                    </span>
                  </Cell>
                  <Cell label="Campaign">
                    {camp ? (
                      <Link
                        href={`/campaign/${camp.id}`}
                        className="line-clamp-1 hover:underline"
                      >
                        {camp.title}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Cell>
                </div>

                <div className="grid grid-cols-2 gap-px bg-border/60 sm:grid-cols-4">
                  <Cell label="Engagement">
                    {eng ? (
                      <span className="flex flex-wrap gap-2 text-[11px]">
                        {eng.likes != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <Heart size={11} className="text-muted" />
                            {fmtViews(eng.likes)}
                          </span>
                        )}
                        {eng.comments != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <MessageCircle size={11} className="text-muted" />
                            {fmtViews(eng.comments)}
                          </span>
                        )}
                        {eng.shares != null && (
                          <span className="inline-flex items-center gap-0.5">
                            <Share2 size={11} className="text-muted" />
                            {fmtViews(eng.shares)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">not yet available</span>
                    )}
                  </Cell>
                  <Cell label="Platform">
                    <span className="inline-flex items-center gap-1">
                      <PlatformIcon p={k.platform ?? "Instagram"} size={12} />
                      {k.platform}
                    </span>
                  </Cell>
                  <Cell label="Campaign rules" className="col-span-2">
                    {camp?.rules ? (
                      <button
                        onClick={() => setRulesId(open ? null : k.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        View rules
                        <ChevronDown
                          size={12}
                          className={`transition ${open ? "rotate-180" : ""}`}
                        />
                      </button>
                    ) : (
                      <span className="text-muted">no rules set</span>
                    )}
                  </Cell>
                </div>

                {open && (
                  <div className="border-t bg-accent-soft/40 p-4 text-xs">
                    <p className="mb-1 font-medium text-foreground">
                      Campaign rules
                    </p>
                    <p className="whitespace-pre-line text-muted">
                      {camp?.rules}
                    </p>
                    {k.rejectionReason && (
                      <div className="mt-3">
                        <p className="mb-0.5 font-medium text-foreground">
                          Rejection reason
                        </p>
                        <p className="text-muted">
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

function Cell({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card px-4 py-2.5 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-0.5 text-xs text-foreground">{children}</div>
    </div>
  );
}
