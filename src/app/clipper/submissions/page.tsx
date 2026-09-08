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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          Track your clips, approvals, views, and earnings.
        </p>
      </div>

      {/* Compact summary */}
      <div className="flex items-center gap-5 text-sm">
        <div>
          <span className="text-muted">Total earned </span>
          <span className="font-mono font-medium">{rup(totalEarnedNet)}</span>
        </div>
        <div>
          <span className="text-muted">Paid out </span>
          <span className="font-mono font-medium text-green">{rup(totalPaidNet)}</span>
        </div>
        <div>
          <span className="text-muted">Pending </span>
          <span className="font-mono font-medium text-amber">{pendingReview}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "border-accent bg-accent-soft text-foreground"
                : "text-muted hover:bg-accent-soft"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-background px-1.5 text-xs">
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted">
          No clips in this view.
        </p>
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

            /* Status microcopy */
            let statusNote = "";
            if (k.status === "pending") statusNote = "Waiting for review";
            else if (k.status === "approved") statusNote = "Earning";
            else if (k.status === "held") statusNote = "On hold";
            else if (k.status === "rejected") statusNote = "Rejected";

            return (
              <div key={k.id} className="rounded-xl border bg-card p-3 sm:p-4">
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  <Link
                    href={`/clip/${k.id}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-accent-soft sm:h-28 sm:w-32"
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

                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    {/* Row 1: title + status */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${k.campaignId}`}
                          className="text-sm font-semibold hover:underline underline-offset-2"
                        >
                          {campaign?.title ?? "Campaign"}
                        </Link>
                        <p className="line-clamp-1 text-xs text-muted">
                          {k.caption}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusPill status={k.status} />
                      </div>
                    </div>

                    {/* Row 2: meta */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <PlatformIcon
                          p={k.platform ?? "Instagram"}
                          size={11}
                        />
                        {k.platform ?? "Instagram"}
                      </span>
                      <span>·</span>
                      <span>Submitted {fmtDate(k.submittedAt)}</span>
                      {statusNote && (
                        <>
                          <span>·</span>
                          <span>{statusNote}</span>
                        </>
                      )}
                    </div>

                    {/* Row 3: views + earnings — dominant */}
                    <div className="mt-2.5 flex items-baseline gap-4">
                      <div>
                        <span className="font-mono text-lg font-bold tracking-tight">
                          {k.verifiedViews ? fmtViews(k.verifiedViews) : "—"}
                        </span>
                        <span className="ml-1 text-[11px] text-muted">
                          verified views
                        </span>
                      </div>
                      {earned > 0 && (
                        <div>
                          <span className="font-mono text-lg font-bold tracking-tight">
                            {rup(earned)}
                          </span>
                          <span className="ml-1 text-[11px] text-muted">
                            earned
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rejection block */}
                {k.status === "rejected" && (
                  <div className="mt-3 rounded-lg border border-red/20 bg-red/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-red">
                      <MessageSquareWarning size={14} /> Rejected
                    </p>
                    {k.rejectionReason && (
                      <p className="mt-1 text-muted">
                        <span className="font-medium text-foreground">
                          Reason:{" "}
                        </span>
                        {k.rejectionReason}
                      </p>
                    )}
                    {k.rejectionDetails && (
                      <p className="mt-0.5 text-muted">
                        <span className="font-medium text-foreground">
                          Details:{" "}
                        </span>
                        {k.rejectionDetails}
                      </p>
                    )}
                  </div>
                )}

                {/* Held note */}
                {k.status === "held" && k.heldReason && (
                  <div className="mt-3 rounded-lg border border-amber/20 bg-amber/5 p-3 text-sm text-muted">
                    <span className="font-medium text-foreground">
                      Hold reason:{" "}
                    </span>
                    {k.heldReason}
                  </div>
                )}

                {/* Details toggle */}
                <button
                  onClick={() => toggleDetails(k.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
                >
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                  {isOpen ? "Hide details" : "View details"}
                </button>

                {/* Expanded details */}
                {isOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-border/50 pt-3 text-xs sm:grid-cols-3">
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

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clip/${k.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    <Film size={13} /> View clip
                  </Link>
                  <Link
                    href={`/campaigns/${k.campaignId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted hover:bg-accent-soft"
                  >
                    <ExternalLink size={13} /> View campaign
                  </Link>
                  {k.status === "rejected" && (
                    <button
                      onClick={() =>
                        setAppealed((a) => ({ ...a, [k.id]: true }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted hover:bg-accent-soft"
                    >
                      <MessageSquareWarning size={13} /> Appeal rejection
                    </button>
                  )}
                </div>
                {appealed[k.id] && (
                  <p className="mt-2 text-xs text-green">
                    Appeal submitted — our team will review and respond within 7
                    days.
                  </p>
                )}
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border bg-card py-3 text-sm font-medium hover:bg-accent-soft"
            >
              <ChevronDown size={15} /> Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
