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
import { rup, fmtViews } from "@/lib/format";
import { isEarned, payoutSplit } from "@/lib/finance";
import type { Clip } from "@/lib/types";

const TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PAGE_SIZE = 8;

const GRADIENTS = [
  "from-sky-500/25 to-indigo-500/25",
  "from-rose-500/25 to-orange-500/25",
  "from-emerald-500/25 to-teal-500/25",
  "from-violet-500/25 to-fuchsia-500/25",
];
function gradientFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h + ch.charCodeAt(0)) % GRADIENTS.length;
  return GRADIENTS[h];
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ClipperSubmissionsPage() {
  const { campaigns, clips } = useStore();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [appealed, setAppealed] = useState<Record<string, boolean>>({});

  function selectTab(key: TabKey) {
    setTab(key);
    setPage(1);
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
      : tab === "processing"
        ? myClips.filter((k) => ["approved", "payable", "processing"].includes(k.status))
        : myClips.filter((k) => k.status === tab);

  const sorted = [...filtered].sort((a, b) => b.submittedAt - a.submittedAt);
  const visible = sorted.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < sorted.length;

  // A clipper receives NET (gross minus platform fee); reflect that in their totals.
  const netOf = (k: Clip) => payoutSplit(k, campaigns).net;
  const totalEarnedNet = myClips
    .filter((k) => isEarned(k.status))
    .reduce((s, k) => s + netOf(k), 0);
  const totalPaidNet = myClips
    .filter((k) => k.status === "paid")
    .reduce((s, k) => s + netOf(k), 0);
  const pendingReview = myClips.filter((k) => k.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Submissions</h1>
        <p className="mt-1 text-sm text-muted">
          {myClips.length} clip{myClips.length === 1 ? "" : "s"} you&apos;ve submitted.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted">Total earned</p>
          <p className="mt-1 font-mono text-lg font-semibold">{rup(totalEarnedNet)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted">Paid out</p>
          <p className="mt-1 font-mono text-lg font-semibold text-green">
            {rup(totalPaidNet)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted">Pending</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber">
            {pendingReview}
          </p>
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
            <span className="rounded-full bg-background px-1.5 text-xs">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted">
          No clips in this view.
        </p>
      ) : (
        <div className="space-y-4">
          {visible.map((k) => {
            const campaign = campaigns.find((c) => c.id === k.campaignId);
            const e = netOf(k);
            const earnedShown = e;
            const paidShown = k.status === "paid" ? e : 0;
            const cpm = campaign?.payout ?? 0;

            return (
              <div key={k.id} className="rounded-2xl border bg-card p-4">
                <div className="flex gap-4">
                  {/* Thumbnail placeholder */}
                  <Link
                    href={`/clip/${k.id}`}
                    className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradientFor(k.id)} text-foreground/70`}
                  >
                    <PlatformIcon p={k.platform ?? "Instagram"} size={26} />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/campaigns/${k.campaignId}`}
                          className="font-semibold hover:underline underline-offset-2"
                        >
                          {campaign?.title ?? "Campaign"}
                        </Link>
                        <p className="line-clamp-1 text-xs text-muted">{k.caption}</p>
                      </div>
                      <StatusPill status={k.status} />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <PlatformIcon p={k.platform ?? "Instagram"} size={13} />
                        {k.platform ?? "Instagram"}
                      </span>
                      <span>Submitted {fmtDate(k.submittedAt)}</span>
                      {campaign && (
                        <span className="inline-flex items-center gap-1">
                          Campaign:{" "}
                          <StatusPill status={campaign.status} />
                        </span>
                      )}
                    </div>

                    <a
                      href={k.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-accent hover:underline"
                    >
                      {k.videoUrl} <ExternalLink size={11} />
                    </a>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="rounded-lg border bg-background p-2.5">
                    <p className="text-[11px] text-muted">Verified views</p>
                    <p className="mt-0.5 font-mono text-sm font-medium">
                      {k.views ? fmtViews(k.views) : "—"}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <p className="text-[11px] text-muted">CPM</p>
                    <p className="mt-0.5 font-mono text-sm font-medium">
                      {rup(cpm)}
                      <span className="text-[10px] text-muted">/1K</span>
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <p className="text-[11px] text-muted">Est. / earned</p>
                    <p className="mt-0.5 font-mono text-sm font-medium">
                      {rup(earnedShown)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <p className="text-[11px] text-muted">Paid</p>
                    <p className="mt-0.5 font-mono text-sm font-medium text-green">
                      {rup(paidShown)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-background p-2.5">
                    <p className="text-[11px] text-muted">Last view update</p>
                    <p className="mt-0.5 font-mono text-sm font-medium">—</p>
                  </div>
                </div>

                {/* Rejection reason */}
                {k.status === "rejected" && (
                  <div className="mt-3 rounded-lg border border-red/20 bg-red/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-red">
                      <MessageSquareWarning size={14} /> Rejected
                    </p>
                    <p className="mt-1 text-muted">
                      <span className="font-medium text-foreground">Reason:</span>{" "}
                      {k.rejectionReason ?? "—"}
                    </p>
                    {k.rejectionDetails && (
                      <p className="mt-0.5 text-muted">
                        <span className="font-medium text-foreground">Details:</span>{" "}
                        {k.rejectionDetails}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clip/${k.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
                  >
                    <Film size={14} /> View clip
                  </Link>
                  <Link
                    href={`/campaigns/${k.campaignId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
                  >
                    <ExternalLink size={14} /> View campaign
                  </Link>
                  {k.status === "rejected" && (
                    <button
                      onClick={() =>
                        setAppealed((a) => ({ ...a, [k.id]: true }))
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent-soft"
                    >
                      <MessageSquareWarning size={14} /> Appeal rejection
                    </button>
                  )}
                </div>
                {appealed[k.id] && (
                  <p className="mt-2 text-xs text-green">
                    Appeal submitted — our team will review and respond within 7 days.
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
