"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Film,
  MessageSquareWarning,
  ChevronDown,
} from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { rup, fmtViews, clipEarnings } from "@/lib/format";

import type { Clip } from "@/lib/types";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "held", label: "Held" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 8;

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClipperSubmissionsPage() {
  const { campaigns, clips, financeRecords } = useStore();
  const { user } = useAuth();
  useAutoRefresh();
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [appealed, setAppealed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function selectTab(key: TabKey) {
    setTab(key);
    setPage(1);
  }

  function toggleDetails(id: string) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  const myClips = clips.filter((k) => k.userId && k.userId === user?.id);

  const counts = TABS.reduce<Record<string, number>>((acc, t) => {
    acc[t.key] =
      t.key === "all"
        ? myClips.length
        : myClips.filter((k) => k.status === t.key).length;
    return acc;
  }, {});

  const filtered =
    tab === "all"
      ? myClips
      : myClips.filter((k) => k.status === tab);

  const sorted = [...filtered].sort((a, b) => b.submittedAt - a.submittedAt);
  const visible = sorted.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < sorted.length;

  const netOf = (k: Clip) =>
    (financeRecords.find((r) => r.clipId === k.id)?.netAmount ?? 0) / 100;
  const totalEarnedNet = myClips
    .filter((k) => k.status === "approved" || k.status === "held")
    .reduce((s, k) => s + netOf(k), 0);
  const totalPaidNet = myClips
    .filter((_k) => false)
    .reduce((s, _k) => s + netOf(_k), 0);
  const pendingReview = myClips.filter((k) => k.status === "pending").length;

  const emptyMessages: Record<TabKey, { heading: string; body: string }> = {
    all: {
      heading: "No clips yet",
      body: "You haven't submitted any clips yet.",
    },
    pending: {
      heading: "Nothing waiting for review",
      body: "No clips are waiting for review.",
    },
    rejected: {
      heading: "No rejected clips",
      body: "No rejected clips.",
    },
    held: {
      heading: "No held clips",
      body: "No clips are currently on hold.",
    },
  };

  return (
    <div className="mx-auto max-w-[1120px] space-y-8 px-5 py-10 sm:px-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[26px]">
          My Submissions
        </h1>
        <p className="mt-2 text-[14px] text-muted sm:text-[15px]">
          Track your clips, approvals, views, and earnings.
        </p>
      </div>

      {/* ── Earnings Summary ────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-[12px] leading-none text-muted">Total earned</p>
          <p className="mt-1.5 font-mono text-[16px] font-bold tracking-tight">
            {rup(totalEarnedNet)}
          </p>
        </div>
        <div>
          <p className="text-[12px] leading-none text-muted">Paid out</p>
          <p className="mt-1.5 font-mono text-[16px] font-bold tracking-tight text-green">
            {rup(totalPaidNet)}
          </p>
        </div>
        <div>
          <p className="text-[12px] leading-none text-muted">Pending</p>
          <p className="mt-1.5 font-mono text-[16px] font-bold tracking-tight text-amber">
            {pendingReview}
          </p>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="-mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
              tab === t.key
                ? "border-accent bg-accent-soft text-foreground"
                : "border-transparent text-muted hover:bg-accent-soft/60"
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 text-[11px] ${
                tab === t.key ? "bg-background text-muted" : "text-muted/60"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* ── Submissions List ─────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="rounded-[12px] border border-dashed bg-card py-16 text-center">
          <p className="text-[16px] font-medium">
            {emptyMessages[tab].heading}
          </p>
          <p className="mt-2 text-[14px] text-muted">
            {emptyMessages[tab].body}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((k) => {
            const campaign = campaigns.find((c) => c.id === k.campaignId);
            const earned = clipEarnings(k, campaigns);
            const fin = financeRecords.find((r) => r.clipId === k.id);
            const paidAmount =
              fin?.status === "paid" ? (fin.netAmount ?? 0) / 100 : 0;
            const cpm = campaign?.payout ?? 0;
            const thumb = campaign?.thumbnails?.[0];
            const isOpen = expanded[k.id];

            let statusNote = "";
            if (k.status === "pending") statusNote = "Waiting for review";
            else if (k.status === "approved") statusNote = "Earning";
            else if (k.status === "held") statusNote = "On hold";
            else if (k.status === "rejected") statusNote = "Rejected";

            return (
              <div
                key={k.id}
                className="rounded-[12px] border bg-card p-4 transition-colors duration-150 hover:border-foreground/8 sm:p-5"
              >
                <div className="flex gap-4">
                  {/* ── Thumbnail ──────────────────────────── */}
                  <Link
                    href={`/clip/${k.id}`}
                    className="relative h-[88px] w-[112px] shrink-0 overflow-hidden rounded-lg bg-accent-soft sm:h-[96px] sm:w-[144px]"
                  >
                    {thumb ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <PlatformIcon
                          p={k.platform ?? "Instagram"}
                          size={22}
                        />
                      </div>
                    )}
                  </Link>

                  {/* ── Main Content ───────────────────────── */}
                  <div className="min-w-0 flex-1">
                    {/* Row 1: Title + Status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${k.campaignId}`}
                          className="text-[15px] font-semibold leading-snug hover:underline underline-offset-2 sm:text-[16px]"
                        >
                          {campaign?.title ?? "Campaign"}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">
                          {k.caption}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <StatusPill status={k.status} />
                      </div>
                    </div>

                    {/* Row 2: Performance — dominant */}
                    <div className="mt-3 flex items-baseline gap-5">
                      <div>
                        <span className="font-mono text-[18px] font-bold tracking-tight sm:text-[20px]">
                          {k.verifiedViews
                            ? fmtViews(k.verifiedViews)
                            : "—"}
                        </span>
                        <span className="ml-1.5 text-[12px] text-muted">
                          verified views
                        </span>
                      </div>
                      {earned > 0 && (
                        <div>
                          <span className="font-mono text-[18px] font-bold tracking-tight sm:text-[20px]">
                            {rup(earned)}
                          </span>
                          <span className="ml-1.5 text-[12px] text-muted">
                            earned
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Row 3: Metadata */}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted sm:text-[13px]">
                      <span className="inline-flex items-center gap-1">
                        <PlatformIcon
                          p={k.platform ?? "Instagram"}
                          size={12}
                        />
                        {k.platform ?? "Instagram"}
                      </span>
                      <span className="text-border">·</span>
                      <span>{fmtDate(k.submittedAt)}</span>
                      {statusNote && (
                        <>
                          <span className="text-border">·</span>
                          <span>{statusNote}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Rejection Block ──────────────────────── */}
                {k.status === "rejected" && (
                  <div className="mt-4 rounded-lg border border-red/20 bg-red/[0.04] p-3.5">
                    <p className="flex items-center gap-1.5 text-[13px] font-medium text-red">
                      <MessageSquareWarning size={14} /> Rejected
                    </p>
                    {k.rejectionReason && (
                      <p className="mt-1.5 text-[13px] text-muted">
                        <span className="font-medium text-foreground">
                          Reason:{" "}
                        </span>
                        {k.rejectionReason}
                      </p>
                    )}
                    {k.rejectionDetails && (
                      <p className="mt-0.5 text-[13px] text-muted">
                        <span className="font-medium text-foreground">
                          Details:{" "}
                        </span>
                        {k.rejectionDetails}
                      </p>
                    )}
                  </div>
                )}

                {/* ── Held Block ──────────────────────────── */}
                {k.status === "held" && k.heldReason && (
                  <div className="mt-4 rounded-lg border border-amber/20 bg-amber/[0.04] p-3.5 text-[13px] text-muted">
                    <span className="font-medium text-foreground">
                      Hold reason:{" "}
                    </span>
                    {k.heldReason}
                  </div>
                )}

                {/* ── View Details Toggle ──────────────────── */}
                <button
                  onClick={() => toggleDetails(k.id)}
                  className="mt-3 inline-flex items-center gap-1 text-[13px] text-muted transition-colors duration-150 hover:text-foreground"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                  {isOpen ? "Hide details" : "View details"}
                </button>

                {/* ── Expanded Details ─────────────────────── */}
                {isOpen && (
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border/50 pt-3 text-[13px] sm:grid-cols-3">
                    <div>
                      <span className="text-muted">CPM </span>
                      <span className="font-medium">
                        {rup(cpm)}
                        <span className="text-muted">/1K</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Earned </span>
                      <span className="font-medium">{rup(earned)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Paid </span>
                      <span className="font-medium text-green">
                        {rup(paidAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Last updated </span>
                      <span className="font-medium">
                        {k.updatedAt ? fmtDate(k.updatedAt) : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted">Campaign </span>
                      <span className="font-medium">
                        {campaign?.status ?? "—"}
                      </span>
                    </div>
                    <a
                      href={k.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-medium text-accent hover:underline"
                    >
                      Clip URL <ExternalLink size={11} />
                    </a>
                  </div>
                )}

                {/* ── Actions ─────────────────────────────── */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clip/${k.id}`}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-4 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-foreground/90"
                  >
                    <Film size={13} /> View clip
                  </Link>
                  <Link
                    href={`/campaigns/${k.campaignId}`}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft"
                  >
                    <ExternalLink size={13} /> View campaign
                  </Link>
                  {k.status === "rejected" && (
                    <button
                      onClick={() =>
                        setAppealed((a) => ({ ...a, [k.id]: true }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-[10px] border px-4 py-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft"
                    >
                      <MessageSquareWarning size={13} /> Appeal rejection
                    </button>
                  )}
                </div>
                {appealed[k.id] && (
                  <p className="mt-2.5 text-[13px] text-green">
                    Appeal submitted — our team will review and respond within 7
                    days.
                  </p>
                )}
              </div>
            );
          })}

          {/* ── Load More ─────────────────────────────────── */}
          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="flex w-full items-center justify-center gap-1.5 rounded-[12px] border bg-card py-3.5 text-[14px] font-medium text-muted transition-colors duration-150 hover:bg-accent-soft"
            >
              <ChevronDown size={15} /> Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
