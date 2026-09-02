"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Pencil,
  Pause,
  Play,
  Ban,
  Wallet,
  ArrowLeft,
  ExternalLink,
  Film,
  Users,
  Eye,
  TrendingUp,
  Heart,
  History,
  RotateCcw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { rup, fmtViews, clipEarnings } from "@/lib/format";
import { financeOf, creatorFee, PLATFORM_FEE_RATE } from "@/lib/finance";
import { seriesByDay } from "@/lib/analytics";
import { StatusPill } from "@/components/StatusPill";
import { PlatformIcon } from "@/components/PlatformIcon";
import { TopClipsTable } from "@/components/TopClipsTable";
import { TimeSeriesChart } from "@/components/charts";
import { EditCampaignModal } from "@/components/EditCampaignModal";
import { AdjustBudgetModal } from "@/components/AdjustBudgetModal";

function fmtDateTime(t: number) {
  return new Date(t).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CreatorCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { campaigns, clips, updateCampaign, financeRecords } = useStore();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const camp = campaigns.find((c) => c.id === id);

  if (!camp) {
    return (
      <div className="space-y-6">
        <Link
          href="/creator/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft size={14} /> Back to campaigns
        </Link>
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <p className="font-medium">Campaign not found</p>
          <p className="mt-1 text-sm text-muted">
            It may have been deleted or isn&apos;t yours.
          </p>
        </div>
      </div>
    );
  }

  const actor = user?.email ?? user?.name ?? "Creator";
  const campClips = clips.filter((k) => k.campaignId === id);
  const fin = financeOf(financeRecords, (r) => r.campaignId === id);
  const currentSpend = fin.paid;
  const verifiedViews = campClips.reduce((s, k) => s + k.views, 0);
  const clipperSet = new Set(campClips.map((k) => k.userId ?? k.clipper));
  const avgCPM =
    verifiedViews > 0 && currentSpend > 0
      ? currentSpend / (verifiedViews / 1000)
      : null;
  const engagement = campClips.reduce((s, k) => {
    if (!k.engagement) return s;
    return (
      s +
      (k.engagement.likes ?? 0) +
      (k.engagement.comments ?? 0) +
      (k.engagement.shares ?? 0)
    );
  }, 0);
  const budget = camp.budget ?? 0;
  const remaining = Math.max(0, budget - currentSpend);
  const budgetPct = budget > 0 ? Math.min(100, Math.round((currentSpend / budget) * 100)) : 0;
  const isClosed = camp.status === "closed";
  const isPaused = camp.status === "paused";

  const viewsSeries = seriesByDay(campClips, (k) => k.views);
  const spendSeries = seriesByDay(campClips, (k) => clipEarnings(k, campaigns));

  const handleEdit = (patch: Partial<typeof camp>, note?: string) =>
    updateCampaign(camp.id, patch, actor, "edited", note);
  const handleBudget = (b: number, note: string) =>
    updateCampaign(camp.id, { budget: b }, actor, "budget", note);
  const handlePause = () =>
    updateCampaign(camp.id, { status: "paused" }, actor, "paused", "Paused campaign");
  const handleResume = () =>
    updateCampaign(camp.id, { status: "open" }, actor, "resumed", "Resumed campaign");
  const handleEnd = () => {
    if (confirm("End this campaign? It will stop accepting new submissions."))
      updateCampaign(camp.id, { status: "closed" }, actor, "ended", "Ended campaign");
  };
  const handleReopen = () => {
    if (confirm("Reopen this campaign? It will start accepting submissions again."))
      updateCampaign(camp.id, { status: "open" }, actor, "reopened", "Reopened campaign");
  };

  return (
    <div className="space-y-8">
      <Link
        href="/creator/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{camp.title}</h1>
            <StatusPill status={camp.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {camp.niche} · {camp.platform}
            {camp.startDate || camp.endDate
              ? ` · ${camp.startDate ?? "—"} → ${camp.endDate ?? "—"}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            <Pencil size={14} /> Edit
          </button>
          {camp.status === "open" && (
            <button
              onClick={handlePause}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
            >
              <Pause size={14} /> Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={handleResume}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent-soft"
            >
              <Play size={14} /> Resume
            </button>
          )}
          {!isClosed && (
            <button
              onClick={handleEnd}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red/30 px-3 py-2 text-sm font-medium text-red hover:bg-red/5"
            >
              <Ban size={14} /> End
            </button>
          )}
          {isClosed && (
            <button
              onClick={handleReopen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-green/30 px-3 py-2 text-sm font-medium text-green hover:bg-green/5"
            >
              <RotateCcw size={14} /> Reopen
            </button>
          )}
          {!isClosed && (
            <button
              onClick={() => setAdjusting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Wallet size={14} /> Adjust budget
            </button>
          )}
        </div>
      </div>

      {/* Budget strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <HeaderStat label="Budget" value={rup(budget)} />
        <HeaderStat label="Platform fee" value={rup(creatorFee(currentSpend))} />
        <HeaderStat label="Remaining budget" value={rup(remaining)} accent={remaining <= 0} />
        <HeaderStat label="Start" value={camp.startDate ?? "—"} />
        <HeaderStat label="End" value={camp.endDate ?? "—"} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
          <span>{rup(currentSpend)} spent</span>
          <span>{rup(remaining)} left</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft">
          <div
            className={`h-full rounded-full ${remaining <= 0 ? "bg-red" : "bg-accent"}`}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        {remaining <= 0 && (
          <p className="mt-1 text-xs text-red">
            Budget reached — this campaign cannot spend beyond its configured budget.
          </p>
        )}
      </div>

      {/* Performance */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Perf icon={<Eye size={14} />} label="Verified views" value={fmtViews(verifiedViews)} />
        <Perf icon={<Film size={14} />} label="Clips" value={String(campClips.length)} />
        <Perf icon={<Users size={14} />} label="Clippers" value={String(clipperSet.size)} />
        <Perf icon={<Wallet size={14} />} label="Spend" value={rup(currentSpend)} />
        <Perf icon={<TrendingUp size={14} />} label="Avg CPM" value={avgCPM != null ? rup(avgCPM) : "—"} />
        <Perf icon={<Heart size={14} />} label="Engagement" value={engagement > 0 ? fmtViews(engagement) : "—"} />
      </section>

      {/* 1. Campaign brief */}
      <Section title="Campaign brief">
        <Defs
          rows={[
            ["Brief", camp.brief],
            ["Objective", camp.objective],
            ["Category", camp.category],
            ["Niche", camp.niche],
            ["What to make", camp.whatToMake],
            ["Hook", camp.hook],
            ["CTA", camp.cta],
            ["Style", camp.style],
            ["Branding", camp.branding],
            ["Recommended duration", camp.recommendedDuration],
          ]}
        />
      </Section>

      {/* 2. Source assets */}
      <Section title="Source assets">
        <ul className="space-y-2 text-sm">
          {camp.sourceLink && (
            <Asset label="Source video" value={camp.sourceLink} />
          )}
          {camp.thumbnails?.map((t, i) => (
            <Asset key={i} label={`Thumbnail ${i + 1}`} value={t} />
          ))}
          {camp.brandAssets?.map((a, i) => (
            <Asset key={i} label={a.label || `Brand asset ${i + 1}`} value={a.url} />
          ))}
          {camp.sourceAssets?.map((a, i) => (
            <Asset key={i} label={a.label || `Asset ${i + 1}`} value={a.url} />
          ))}
          {camp.exampleClips?.map((a, i) => (
            <Asset key={i} label={`Example ${i + 1}`} value={a.url} />
          ))}
          {!camp.sourceLink &&
            !camp.thumbnails?.length &&
            !camp.brandAssets?.length &&
            !camp.sourceAssets?.length &&
            !camp.exampleClips?.length && (
              <li className="text-muted">No source assets added.</li>
            )}
        </ul>
      </Section>

      {/* 3. Rules */}
      <Section title="Rules">
        <Defs
          rows={[
            ["Campaign rules", camp.rules],
            [
              "Min views",
              camp.viewRules?.minViews != null ? String(camp.viewRules.minViews) : undefined,
            ],
            ["Max payout / clip", camp.maxPayoutPerClip != null ? rup(camp.maxPayoutPerClip) : undefined],
            ["Spend cap", camp.spendCap != null ? rup(camp.spendCap) : undefined],
            ["Auto-approve", camp.approval?.autoReview ? "Yes" : "No"],
            ["Review time", camp.approval?.reviewTime],
          ]}
        />
        {camp.doList?.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Do</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {camp.doList.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {camp.dontList?.length ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted">Don&apos;t</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {camp.dontList.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {/* 4. Submissions */}
      <Section title={`Submissions (${campClips.length})`}>
        <ClipList clips={campClips} earned={false} />
      </Section>

      {/* 5. Approved clips */}
      <Section title={`Approved clips (${campClips.filter((k) => k.status === "approved" || k.status === "held").length})`}>
        <ClipList clips={campClips} earned />
      </Section>

      {/* 6. Analytics */}
      <Section
        title="Analytics"
        action={
          <Link
            href={`/creator/analytics/${camp.id}`}
            className="text-xs font-medium text-accent hover:underline underline-offset-2"
          >
            Full analytics →
          </Link>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-background/40 p-4">
            <p className="mb-2 text-sm font-medium">Views over time</p>
            <TimeSeriesChart data={viewsSeries} format={fmtViews} />
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <p className="mb-2 text-sm font-medium">Spend over time</p>
            <TimeSeriesChart data={spendSeries} format={rup} />
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border bg-background/40">
          <TopClipsTable clips={campClips} campaigns={campaigns} />
        </div>
      </Section>

      {/* 7. Budget & transactions */}
      <Section title="Budget & transactions">
        <p className="mb-3 text-sm text-muted">
          Transactions are derived from the clip ledger — a campaign can never spend
          beyond its configured budget ({rup(budget)}). A {Math.round(PLATFORM_FEE_RATE * 100)}% platform fee applies to all payouts.
        </p>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Clipper</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Gross</th>
                <th className="px-4 py-3 text-right font-medium">Fee</th>
                <th className="px-4 py-3 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campClips
                .filter((k) => k.status === "approved" || k.status === "held")
                .sort((a, b) => b.submittedAt - a.submittedAt)
                .map((k) => {
                  const gross = clipEarnings(k, campaigns);
                  const fee = creatorFee(gross);
                  return (
                    <tr key={k.id}>
                      <td className="px-4 py-3 text-muted">{fmtDateTime(k.submittedAt)}</td>
                      <td className="px-4 py-3 font-medium">@{k.clipper}</td>
                      <td className="px-4 py-3">
                        <StatusPill status={k.status} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{rup(gross)}</td>
                      <td className="px-4 py-3 text-right font-mono text-muted">{rup(fee)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {rup(gross - fee)}
                      </td>
                    </tr>
                  );
                })}
              {campClips.filter((k) => k.status === "approved" || k.status === "held").length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted">
                    No payouts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 8. Content rights */}
      <Section title="Content rights">
        {camp.rights ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["Ads", camp.rights.ads],
                ["Social", camp.rights.social],
                ["Website", camp.rights.website],
                ["Other", camp.rights.other],
              ] as Array<[string, boolean]>
            ).map(([label, on]) => (
              <span
                key={label}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  on
                    ? "border-green/20 bg-green/10 text-green"
                    : "border-muted/20 bg-accent-soft text-muted"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No rights specified.</p>
        )}
        {camp.rights?.otherText && (
          <p className="mt-2 text-sm text-muted">Other: {camp.rights.otherText}</p>
        )}
      </Section>

      {/* Audit log */}
      {camp.audit && camp.audit.length > 0 && (
        <Section
          title="Audit log"
          action={<History size={14} className="text-muted" />}
        >
          <ol className="space-y-2">
            {camp.audit.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div>
                  <p className="font-medium capitalize">{e.action}</p>
                  <p className="text-muted">
                    {e.by ? `${e.by} · ` : ""}
                    {fmtDateTime(e.at)}
                  </p>
                  {e.note && <p className="text-muted">{e.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {editing && (
        <EditCampaignModal
          campaign={camp}
          submissionCount={campClips.length}
          currentSpend={currentSpend}
          onClose={() => setEditing(false)}
          onSave={(patch, note) => {
            handleEdit(patch, note);
            setEditing(false);
          }}
        />
      )}
      {adjusting && (
        <AdjustBudgetModal
          campaign={camp}
          currentSpend={currentSpend}
          onClose={() => setAdjusting(false)}
          onSave={(b, note) => {
            handleBudget(b, note);
            setAdjusting(false);
          }}
        />
      )}
    </div>
  );
}

function HeaderStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-xl font-semibold ${accent ? "text-red" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function Perf({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between text-muted">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <p className="mt-1 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Defs({ rows }: { rows: Array<[string, string | undefined]> }) {
  const filled = rows.filter(([, v]) => v != null && v !== "");
  if (filled.length === 0)
    return <p className="text-sm text-muted">No details provided.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {filled.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <dt className="w-40 shrink-0 text-muted">{k}</dt>
          <dd className="min-w-0 flex-1">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Asset({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="w-32 shrink-0 text-muted">{label}</span>
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center gap-1 truncate text-accent hover:underline"
      >
        <span className="truncate">{value}</span>
        <ExternalLink size={12} className="shrink-0" />
      </a>
    </li>
  );
}

function ClipList({
  clips,
  earned,
}: {
  clips: import("@/lib/types").Clip[];
  earned: boolean;
}) {
  const list = earned ? clips.filter((k) => k.status === "approved" || k.status === "held") : clips;
  if (list.length === 0)
    return <p className="text-sm text-muted">Nothing here yet.</p>;
  return (
    <div className="space-y-2">
      {list.map((k) => (
        <Link
          key={k.id}
          href={`/clip/${k.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:border-foreground/30"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{k.caption}</p>
            <p className="truncate text-xs text-muted">
              @{k.clipper} · {fmtViews(k.views)} views
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PlatformIcon p={k.platform ?? "Instagram"} size={14} />
            <StatusPill status={k.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}
