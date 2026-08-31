"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Scissors,
  Film,
  Sparkles,
  ShieldCheck,
  IndianRupee,
  Zap,
  Play,
  Ban,
  Check,
  Send,
  ChevronDown,
  BadgeCheck,
  ArrowRight,
  Eye,
  TrendingUp,
  AlertTriangle,
  Calculator,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PlatformIcon } from "@/components/PlatformIcon";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignModal } from "@/components/CampaignModal";
import { rup, clipEarnings } from "@/lib/format";
import { financeOf, PLATFORM_FEE_RATE } from "@/lib/finance";
import type { Campaign } from "@/lib/types";

const NICHES = ["Podcast", "Gaming", "Finance", "Comedy", "Fitness", "Tech"];

const TICKER = ["Find campaigns", "Cut clips", "Post online", "Get paid over UPI"];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Admin-reviewed clips",
    body: "Every clip is reviewed by our team before it's marked approved. No auto-approval, no self-reported metrics — each submission is checked against campaign guidelines.",
  },
  {
    icon: TrendingUp,
    title: "Transparent CPM",
    body: "You see the exact CPM rate before claiming a campaign. No hidden fees, no surprises — you know exactly what you'll earn per 1,000 views.",
  },
  {
    icon: IndianRupee,
    title: "Reliable payouts",
    body: "Payouts settle directly to your UPI once the cycle closes. Every action is recorded in an audit trail — nothing is manual or opaque.",
  },
  {
    icon: Eye,
    title: "Campaign transparency",
    body: "Creators set the budget, CPM, and rules upfront. Clippers see everything before they start cutting. Both sides have full visibility.",
  },
  {
    icon: AlertTriangle,
    title: "Fraud protection",
    body: "Admins review clips for quality and authenticity. Suspicious earnings are frozen and held for investigation before payout.",
  },
];

const FAQ_CATEGORIES = [
  {
    title: "For Clippers",
    items: [
      {
        q: "How do I make money?",
        a: "Browse open campaigns, create a short-form clip from the source material, and post it on your social account. You earn money for every 1,000 views your clip receives, at the campaign's CPM rate. A 10% platform fee is deducted from gross earnings.",
      },
      {
        q: "Do I need followers?",
        a: "No. There is no minimum follower count. Your earnings depend on clip quality and view count, not your follower count.",
      },
      {
        q: "How are views counted?",
        a: "When you submit a clip, you paste the link to your post. Our team reviews each submission for quality and authenticity. View counts are tracked from the linked post — you report the URL, we verify the content meets campaign guidelines.",
      },
      {
        q: "What is CPM?",
        a: "CPM stands for Cost Per Mille (per 1,000 views). If a campaign pays ₹200 CPM and your clip gets 5,000 views, you earn ₹1,000 gross. After the 10% platform fee, you receive ₹900 net.",
      },
      {
        q: "When do I get paid?",
        a: "Earnings move through: Pending → Approved → Payable → Processing → Paid. Once your clip reaches the payable threshold and the admin initiates payout, the money is sent to your UPI account.",
      },
      {
        q: "What happens if my clip is rejected?",
        a: "You'll receive a specific reason (wrong format, missing CTA, policy violation, etc.). You can fix the issue and resubmit, or appeal if you believe the rejection was unfair.",
      },
      {
        q: "Can I join multiple campaigns?",
        a: "Yes. You can submit clips to as many campaigns as you want, as long as each clip follows the specific campaign brief.",
      },
    ],
  },
  {
    title: "For Creators",
    items: [
      {
        q: "How do I launch a campaign?",
        a: "Go to Creator → Campaigns → New Campaign. Fill in the brief, upload source material, set your budget and CPM rate, and publish. Your campaign appears on the marketplace for clippers to browse.",
      },
      {
        q: "How much does it cost?",
        a: "You set your own budget and CPM rate. You only pay for approved views your clips receive. There are no upfront fees — you pay as clips earn.",
      },
      {
        q: "How is CPM determined?",
        a: "You choose the CPM rate when creating the campaign. Higher CPMs attract more clippers and better-quality clips.",
      },
      {
        q: "Can I approve/reject clips?",
        a: "Yes. You review each submitted clip and approve or reject it with a reason. Approved clips go live and start earning.",
      },
      {
        q: "What happens when the budget is exhausted?",
        a: "When your budget is fully committed, the campaign status changes to \"Budget Reached\" and new submissions are blocked. You can increase the budget to reopen the campaign.",
      },
    ],
  },
  {
    title: "Payments",
    items: [
      {
        q: "How does UPI work?",
        a: "You link your UPI ID in your profile settings. Payouts are sent directly to your UPI-linked bank account.",
      },
      {
        q: "What are the fees?",
        a: "ClipTwo charges a 10% platform fee on gross earnings. This covers payment processing, platform maintenance, and support.",
      },
      {
        q: "How long do payouts take?",
        a: "Once a payout is initiated, it typically takes 3–5 business days to reach your account, depending on your payment provider.",
      },
      {
        q: "What happens when a payout fails?",
        a: "If a payout fails (wrong UPI ID, bank issue), the amount stays in your wallet and is retried in the next payout cycle. You'll be notified to update your payment details if needed.",
      },
    ],
  },
  {
    title: "Trust & Safety",
    items: [
      {
        q: "How do you detect fake views?",
        a: "Every clip submission is reviewed by our team. We check that the content matches the campaign brief, the link is valid, and the post is genuine. Suspicious or low-quality submissions are rejected.",
      },
      {
        q: "What happens to suspicious earnings?",
        a: "Earnings flagged as suspicious are frozen pending investigation. If fraud is confirmed, the affected clips are removed and the earnings are forfeited.",
      },
      {
        q: "What happens if a post is deleted?",
        a: "If your clip is deleted from social media, view tracking stops. Earnings up to the point of deletion are preserved, but no new views will be counted.",
      },
      {
        q: "How do appeals work?",
        a: "Submit an appeal through the platform (Submissions → View clip → Appeal). Provide evidence and our team will review within 5 business days.",
      },
    ],
  },
];

const CLIPPER_JOURNEY = [
  { num: "01", label: "Pick a campaign", title: "Browse live campaigns", body: "See the exact rate, platforms, and minimum views up front. No applications, no waiting to get accepted — claim it and start cutting.", visual: "campaigns" },
  { num: "02", label: "Connect accounts", title: "Link where you post", body: "Connect your accounts so we can verify your clip is posted. Your handle is stored for campaign matching.", visual: "connect" },
  { num: "03", label: "Add your UPI ID", title: "Set up your payout", body: "Add the UPI ID you want earnings sent to. One-time setup, verified in seconds, used for every campaign after.", visual: "payout" },
  { num: "04", label: "Post & submit", title: "Drop your clip, paste the link", body: "Cut the clip, post it from your linked account, then paste the link back. Our team reviews each submission.", visual: "submit" },
  { num: "05", label: "Cash out", title: "Get paid per view", body: "When the payout cycle closes, approved earnings settle straight to your UPI ID — no invoices, no chasing anyone down.", visual: "cashout" },
];

const CREATOR_JOURNEY = [
  { num: "01", label: "Launch a campaign", title: "Set your rate and budget", body: "Pick a CPM, set a total budget, upload your source footage and guidelines. The campaign goes live for clippers immediately.", visual: "launch" },
  { num: "02", label: "Clippers claim it", title: "Watch submissions come in", body: "Clippers browse by niche and CPM, claim your brief, and start cutting — no vetting queue on your end unless you want one.", visual: "submissions" },
  { num: "03", label: "Approve what fits", title: "Admin reviews every clip", body: "Every submitted clip is reviewed by our admin team against your guidelines. Nothing gets paid until admin approval — no auto-approvals, no self-reported metrics.", visual: "review" },
  { num: "04", label: "Pay only for real views", title: "Budget spends only on approved clips", body: "Your budget only depletes as clips are approved and views accumulate. If a clip underperforms, you simply don't pay for it.", visual: "budget" },
];

const CAMPAIGN_PREVIEW = [
  { title: "The Grind Podcast — Ep. 143", niche: "Podcast", cpm: 220 },
  { title: "Valorant Ranked Grind", niche: "Gaming", cpm: 160 },
  { title: "Money Mindset Series", niche: "Finance", cpm: 280 },
];

function fmtNum(n: number) {
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
      {/* Background glow */}
      <div className="absolute -inset-12 -z-20 rounded-full bg-gradient-to-br from-accent/20 via-transparent to-purple-500/10 blur-3xl" />

      {/* Main phone frame */}
      <div className="relative mx-auto w-[280px] sm:w-[320px]">
        {/* Phone body */}
        <div className="relative overflow-hidden rounded-[2.5rem] border border-border/50 bg-card shadow-2xl shadow-black/10">
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-card" />

          {/* Screen content */}
          <div className="relative aspect-[9/19] overflow-hidden bg-gradient-to-b from-background to-accent-soft/30">
            {/* Status bar */}
            <div className="flex items-center justify-between px-6 pt-8 pb-2">
              <span className="text-[10px] font-medium text-muted">9:41</span>
              <div className="flex gap-1">
                <div className="h-1 w-1 rounded-full bg-muted" />
                <div className="h-1 w-1 rounded-full bg-muted" />
                <div className="h-1 w-1 rounded-full bg-muted" />
              </div>
            </div>

            {/* Video thumbnail - no text overlay */}
            <div className="mx-4 mt-2 overflow-hidden rounded-2xl">
              <div className="relative flex aspect-[9/14] items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
                {/* Video timeline effect */}
                <div className="absolute inset-x-4 top-1/2 h-px bg-white/20" />
                <div className="absolute left-4 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-white/30" />
                <div className="absolute right-4 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-white/30" />

                {/* Timeline markers */}
                <div className="absolute left-8 right-8 top-1/2 flex justify-between">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className={`h-1.5 w-0.5 rounded-full ${i < 5 ? "bg-accent" : "bg-white/20"}`} />
                  ))}
                </div>

                {/* Progress bar */}
                <div className="absolute left-8 right-8 top-[55%] h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-accent to-accent/60" />
                </div>

                {/* Playhead */}
                <div className="absolute left-[62%] top-[55%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg" />

                {/* Center scissors icon */}
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
                  <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <line x1="20" y1="4" x2="8.12" y2="15.88" />
                    <line x1="14.47" y1="14.48" x2="20" y2="20" />
                    <line x1="8.12" y1="8.12" x2="12" y2="12" />
                  </svg>
                </div>

                {/* Video frames */}
                <div className="absolute left-4 top-6 flex gap-1.5">
                  <div className="h-8 w-12 rounded bg-gradient-to-br from-accent/40 to-accent/20" />
                  <div className="h-8 w-12 rounded bg-gradient-to-br from-purple-400/40 to-purple-400/20" />
                  <div className="h-8 w-12 rounded bg-gradient-to-br from-pink-400/40 to-pink-400/20" />
                </div>

                {/* Duration badge */}
                <div className="absolute right-4 top-6 rounded bg-black/40 px-2 py-0.5 text-[9px] font-mono text-white/80">
                  0:42
                </div>
              </div>
            </div>

            {/* Info below thumbnail */}
            <div className="px-5 pt-4 pb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-green/20 px-2.5 py-1 text-[10px] font-semibold text-green">
                  <Zap size={8} /> Live
                </span>
                <span className="font-mono text-[11px] text-muted">CPM ₹220</span>
              </div>
              <p className="mt-3 text-sm font-semibold">The Grind Podcast — Ep. 142</p>
              <p className="mt-1 text-[11px] text-muted">by Rohan Malhotra</p>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  ["Clips", "14"],
                  ["Views", "1.8L"],
                  ["Paid", "₹18.4K"],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-accent-soft px-2.5 py-2 text-center">
                    <p className="text-[10px] text-muted">{l}</p>
                    <p className="mt-0.5 font-mono text-xs font-bold">{v}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                <div className="h-full w-[46%] rounded-full bg-accent" />
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-muted">₹18,400 / ₹40,000</p>
            </div>
          </div>
        </div>

        {/* Floating card - left */}
        <div className="absolute -left-16 top-12 w-32 rotate-[-6deg] rounded-xl border bg-card p-3 shadow-xl shadow-black/5 sm:-left-20 sm:w-36">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-amber/10">
              <IndianRupee size={10} className="text-amber" />
            </span>
            <span className="text-[9px] font-medium text-muted">Earned</span>
          </div>
          <p className="mt-1.5 font-mono text-sm font-bold">₹12,400</p>
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted/20">
            <div className="h-full w-3/4 rounded-full bg-amber" />
          </div>
        </div>

        {/* Floating card - right */}
        <div className="absolute -right-16 top-28 w-32 rotate-[6deg] rounded-xl border bg-card p-3 shadow-xl shadow-black/5 sm:-right-20 sm:w-36">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-green/10">
              <TrendingUp size={10} className="text-green" />
            </span>
            <span className="text-[9px] font-medium text-muted">Views</span>
          </div>
          <p className="mt-1.5 font-mono text-sm font-bold">1.8L</p>
          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted/20">
            <div className="h-full w-full rounded-full bg-green" />
          </div>
        </div>

        {/* Floating badge - bottom */}
        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border bg-card px-4 py-1.5 shadow-lg">
          <div className="flex items-center gap-2">
            <BadgeCheck size={14} className="text-green" />
            <span className="text-[11px] font-medium">Verified & Paid</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function JourneyVisual({ stageKey }: { stageKey: string }) {
  if (stageKey === "campaigns") {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {CAMPAIGN_PREVIEW.map((c) => (
          <div key={c.title} className="rounded-xl border bg-background p-3.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-green/10 px-2 py-0.5 text-[10px] font-medium text-green">
                <Zap size={9} /> 12d left
              </span>
              <span className="font-mono text-sm font-medium text-amber">{rup(c.cpm)}</span>
            </div>
            <p className="mt-2 text-sm font-medium">{c.title}</p>
            <p className="text-xs text-muted">{c.niche}</p>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "connect") {
    return (
      <div className="divide-y rounded-xl border">
        {[
          ["@thegrindclips", "Instagram", "verified"],
          ["@editzbypriya", "YouTube", "verified"],
          ["@clipsdaily.in", "Instagram", "connecting"],
        ].map(([h, p, s]) => (
          <div key={h} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <PlatformIcon p={p} />
              <span className="font-mono text-sm">{h}</span>
            </span>
            <span className={`text-xs font-medium ${s === "verified" ? "text-green" : "text-amber"}`}>
              {s === "verified" ? "Verified" : "Connecting…"}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "payout") {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2 font-mono text-sm">
          <IndianRupee size={16} className="text-amber" />
          priya@okhdfcbank
          <BadgeCheck size={15} className="ml-auto text-green" />
          <span className="text-xs font-semibold text-green">Verified</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          Payouts settle here automatically when a cycle closes — no manual bank transfer chasing.
        </p>
      </div>
    );
  }
  if (stageKey === "submit") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted">
          instagram.com/reel/xk29a
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          <Send size={13} /> Submit for review
        </button>
      </div>
    );
  }
  if (stageKey === "cashout") {
    return (
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Campaign</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[
              ["The Grind Podcast · Aug", "paid", 4048],
              ["Money Mindset · Aug", "pending", 1820],
              ["Valorant Grind · Jul", "paid", 940],
            ].map(([c, s, a]) => (
              <tr key={c as string}>
                <td className="px-4 py-2.5">{c}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium ${s === "paid" ? "text-green" : "text-amber"}`}>{s}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono">{rup(a as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (stageKey === "launch") {
    return (
      <div className="space-y-2">
        {[
          ["CPM", "₹220 / 1,000 views"],
          ["Budget", "₹40,000"],
          ["Niche", "Podcast"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
            <span className="text-muted">{k}</span>
            <span className="font-mono">{v}</span>
          </div>
        ))}
        <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
          Fund &amp; launch campaign
        </button>
      </div>
    );
  }
  if (stageKey === "submissions") {
    return (
      <div className="divide-y rounded-xl border">
        {[
          ["Priya Nair", "approved"],
          ["Dev Shah", "pending"],
          ["Arjun Rao", "pending"],
        ].map(([n, s]) => (
          <div key={n} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{n}</span>
            <span className={`text-xs font-medium ${s === "approved" ? "text-green" : "text-amber"}`}>{s}</span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "review") {
    return (
      <div className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className="font-medium">Arjun Rao</span>
          <span className="font-mono text-xs text-muted">instagram.com/reel/pw001</span>
        </span>
        <span className="flex gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border text-green"><Check size={14} /></span>
          <span className="flex h-7 w-7 items-center justify-center rounded-md border text-red"><Ban size={14} /></span>
        </span>
      </div>
    );
  }
  if (stageKey === "budget") {
    return (
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full w-[46%] rounded-full bg-accent" />
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-muted">₹18,400 / ₹40,000 spent</p>
        <p className="mt-3 text-xs text-muted">Only approved clips draw down your budget — nothing pays out on a guess.</p>
      </div>
    );
  }
  return null;
}

function Journey() {
  const [tab, setTab] = useState<"clipper" | "creator">("clipper");
  const [step, setStep] = useState(0);
  const journey = tab === "clipper" ? CLIPPER_JOURNEY : CREATOR_JOURNEY;
  const stage = journey[step];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="inline-flex rounded-xl border bg-card p-1">
        <button
          onClick={() => {
            setTab("clipper");
            setStep(0);
          }}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "clipper" ? "bg-accent-soft text-foreground" : "text-muted"}`}
        >
          <Scissors size={14} /> I&apos;m a clipper
        </button>
        <button
          onClick={() => {
            setTab("creator");
            setStep(0);
          }}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "creator" ? "bg-accent-soft text-foreground" : "text-muted"}`}
        >
          <Film size={14} /> I&apos;m a creator
        </button>
      </div>

      <p className="mt-4 text-sm text-muted">Click a stage to preview it.</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col">
          {journey.map((s, i) => (
            <button
              key={s.num}
              onClick={() => setStep(i)}
              className={`border-l-2 py-3 pl-4 text-left transition-colors ${i === step ? "border-accent" : "border-border"}`}
            >
              <span className={`font-mono text-[11px] ${i === step ? "text-foreground" : "text-muted"}`}>{s.num}</span>
              <span className={`block text-sm font-medium ${i === step ? "text-foreground" : "text-muted"}`}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="text-lg font-semibold">{stage.title}</h3>
          <p className="mt-2 max-w-md text-sm text-muted">{stage.body}</p>
          <div className="mt-6">
            <JourneyVisual stageKey={stage.visual} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  const [tab, setTab] = useState(FAQ_CATEGORIES[0].title);
  const [open, setOpen] = useState<string | null>(null);
  const cat = FAQ_CATEGORIES.find((c) => c.title === tab) ?? FAQ_CATEGORIES[0];
  return (
    <div>
      <div className="mx-auto mb-6 flex w-fit rounded-full border bg-card p-1">
        {FAQ_CATEGORIES.map((c) => (
          <button
            key={c.title}
            onClick={() => {
              setTab(c.title);
              setOpen(null);
            }}
            className={`relative rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              tab === c.title
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {cat.items.map((f) => (
          <div key={f.q}>
            <button
              onClick={() => setOpen(open === f.q ? null : f.q)}
              className="flex w-full items-center justify-between px-5 py-4 text-left text-[15px] font-medium"
            >
              {f.q}
              <ChevronDown
                size={18}
                className={`shrink-0 text-muted transition-transform ${open === f.q ? "rotate-180" : ""}`}
              />
            </button>
            {open === f.q && (
              <p className="px-5 pb-4 text-sm leading-relaxed text-muted">
                {f.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EarningsCalculator() {
  const [views, setViews] = useState(10000);
  const [cpm, setCpm] = useState(200);
  const gross = Math.round((views / 1000) * cpm);
  const fee = Math.round(gross * PLATFORM_FEE_RATE);
  const net = gross - fee;
  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} className="text-amber" />
        <h3 className="text-lg font-semibold">Earnings calculator</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted">Verified views</label>
          <input
            type="number"
            value={views}
            onChange={(e) => setViews(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-foreground"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Campaign CPM (₹)</label>
          <input
            type="number"
            value={cpm}
            onChange={(e) => setCpm(Math.max(0, Number(e.target.value)))}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-foreground"
          />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-accent-soft p-3 text-center">
          <p className="text-[11px] text-muted">Gross earnings</p>
          <p className="font-mono text-lg font-semibold">{rup(gross)}</p>
        </div>
        <div className="rounded-xl bg-accent-soft p-3 text-center">
          <p className="text-[11px] text-muted">Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)</p>
          <p className="font-mono text-lg font-semibold text-muted">{rup(fee)}</p>
        </div>
        <div className="rounded-xl bg-accent-soft p-3 text-center">
          <p className="text-[11px] text-muted">You receive</p>
          <p className="font-mono text-lg font-semibold text-green">{rup(net)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Actual payout depends on campaign rules, view verification, and approval.
        This is an estimate only.
      </p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { campaigns, clips, siteSettings } = useStore();
  const [active, setActive] = useState<Campaign | null>(null);

  const heroTitle =
    siteSettings.heroTitle || "Turn creator content into clips. Get paid for the views.";
  const heroSubtitle =
    siteSettings.heroSubtitle ||
    "cliptwo connects creators who have long-form content with clippers who cut it into clips — paid per verified view, settled straight to UPI.";

  // Database-backed statistics
  const stats = useMemo(() => {
    const openCampaigns = campaigns.filter((c) => c.status === "open" || c.status === "near_budget").length;
    const totalViews = clips.reduce((s, k) => s + k.views, 0);
    const clippers = new Set(clips.map((k) => k.clipper)).size;
    const fin = financeOf(clips, campaigns);
    const paidOut = fin.paid;
    return { openCampaigns, totalViews, clippers, paidOut };
  }, [clips, campaigns]);

  // Featured campaigns from database
  const featuredIds = siteSettings.featuredIds;
  const featured = useMemo(() => {
    const open = campaigns.filter(
      (c) => c.status === "open" || c.status === "near_budget",
    );
    if (featuredIds.length) {
      return open.filter((c) => featuredIds.includes(c.id)).slice(0, 4);
    }
    return open.slice(0, 4);
  }, [campaigns, featuredIds]);

  // Top earners for success stories (real data only)
  const topEarners = useMemo(() => {
    const byClipper = new Map<string, { earned: number; clips: number; views: number }>();
    for (const k of clips) {
      const e = clipEarnings(k, campaigns);
      const cur = byClipper.get(k.clipper) ?? { earned: 0, clips: 0, views: 0 };
      cur.earned += e;
      cur.clips += 1;
      cur.views += k.views;
      byClipper.set(k.clipper, cur);
    }
    return Array.from(byClipper.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 3);
  }, [clips, campaigns]);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs text-white">
              <Scissors size={13} />
            </span>
            cliptwo
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#why" className="hover:text-foreground">Why cliptwo</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link href="/clipper" className="hover:text-foreground">Clipper</Link>
            <Link href="/creator" className="hover:text-foreground">Creator</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg border px-3.5 py-1.5 text-sm font-medium hover:bg-accent-soft">
              Log in
            </Link>
            <Link href="/login?mode=signup" className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted shadow-sm">
            <Sparkles size={13} /> India&apos;s clipping marketplace
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            {heroTitle}
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            {heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/clipper" className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-accent/30">
              <Scissors size={15} /> For Clippers
            </Link>
            <Link href="/creator" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg">
              <Film size={15} /> For Creators
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-6 text-sm text-muted">
            <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-green" /> Admin-reviewed clips</span>
            <span className="flex items-center gap-2"><IndianRupee size={16} className="text-amber" /> UPI-native payouts</span>
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* ── Real platform statistics (hidden) ── */}
      {false && (
      <section className="mx-auto max-w-6xl px-6 pb-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { num: fmtNum(stats.totalViews), label: "views tracked" },
            { num: String(stats.clippers), label: "active clippers" },
            { num: String(stats.openCampaigns), label: "live campaigns" },
            { num: rup(stats.paidOut), label: "paid out to clippers" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card p-6 text-center shadow-sm">
              <p className="font-mono text-3xl font-bold tracking-tight">{s.num}</p>
              <p className="mt-1.5 text-xs font-medium text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      <div className="mt-6 border-y bg-card">
        <div className="overflow-hidden">
          <div className="flex w-max animate-ticker">
            {[...TICKER, ...TICKER, ...TICKER, ...TICKER, ...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="flex items-center gap-2 px-8 text-xs font-semibold uppercase tracking-wide text-muted">
                <span className="text-accent">●</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Built for every niches, and every platform that matters
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {NICHES.map((n) => (
            <span key={n} className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <Sparkles size={13} className="text-muted" /> {n}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="Instagram" size={15} /> Instagram</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="YouTube" size={15} /> YouTube</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="Kick" size={15} /> Kick</span>
        </div>
      </div>

      {/* ── How it works ── */}
      <section id="how" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">How it works</p>
        <h2 className="mx-auto mt-4 max-w-xl text-center text-3xl font-bold tracking-tight sm:text-4xl">One loop, two sides.</h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-lg leading-relaxed text-muted">
          The platform&apos;s only job is to run this loop reliably — without either side chasing the other for money or footage.
        </p>
        <div className="mt-12">
          <Journey />
        </div>
      </section>

      {/* ── Live campaigns ── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Live now</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Active campaigns</h2>
            </div>
            <button
              onClick={() => router.push("/campaigns")}
              className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg"
            >
              Browse all <ArrowRight size={15} />
            </button>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((c, i) => (
              <CampaignCard key={c.id} campaign={c} index={i} onView={setActive} />
            ))}
          </div>
        </section>
      )}

      {/* ── Why ClipTwo ── */}
      <section id="why" className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Why cliptwo</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Trust is the product.</h2>
          <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
            Clipping platforms live or die on whether clippers believe they&apos;ll actually get paid. These are the mechanics that make that a promise, not a claim.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-2xl border bg-background p-6 shadow-sm transition-all hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
                  <t.icon size={20} className="text-accent" />
                </div>
                <h4 className="mt-4 text-lg font-semibold">{t.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Earnings calculator (hidden) ── */}
      {false && (
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Earnings</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">See what you could earn.</h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
              Enter the number of views and the campaign CPM rate. The
              calculator shows your gross earnings, the platform fee, and your
              net payout.
            </p>
            <div className="mt-6 space-y-3 text-sm text-muted">
              <p className="flex items-center gap-3"><Check size={16} className="text-green shrink-0" /> Views × CPM ÷ 1,000 = gross earnings</p>
              <p className="flex items-center gap-3"><Check size={16} className="text-green shrink-0" /> 10% platform fee deducted from gross</p>
              <p className="flex items-center gap-3"><Check size={16} className="text-green shrink-0" /> Net amount paid to your UPI</p>
            </div>
            <p className="mt-5 text-xs text-muted">
              Actual payout depends on campaign rules, view verification, and
              approval status. This calculator is for illustration only.
            </p>
          </div>
          <EarningsCalculator />
        </div>
      </section>
      )}

      {/* ── Success stories (hidden) ── */}
      {false && topEarners.length > 0 && (
        <section className="border-y bg-card">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Success stories</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Top earners on ClipTwo</h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted">
              Real clippers, real earnings. These numbers come directly from
              verified payouts on the platform.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              {topEarners.map((e) => (
                <div key={e.name} className="rounded-2xl border bg-background p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-base font-bold text-foreground">
                      {e.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold">@{e.name}</p>
                      <p className="text-xs text-muted">{e.clips} clip{e.clips === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-accent-soft p-3 text-center">
                      <p className="text-[10px] font-medium text-muted">Earned</p>
                      <p className="mt-0.5 font-mono text-base font-bold">{rup(e.earned)}</p>
                    </div>
                    <div className="rounded-xl bg-accent-soft p-3 text-center">
                      <p className="text-[10px] font-medium text-muted">Views</p>
                      <p className="mt-0.5 font-mono text-base font-bold">{fmtNum(e.views)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">FAQ</p>
        <h2 className="mx-auto mt-4 max-w-xl text-center text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked</h2>
        <div className="mt-12">
          <FAQ />
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to start?</h2>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
            Whether you want to earn by clipping or grow your brand through
            creator content, ClipTwo is where it happens.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/clipper"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-accent/30"
            >
              <Scissors size={15} /> Start clipping
            </Link>
            <Link
              href="/creator"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-7 py-3 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg"
            >
              <Film size={15} /> Launch a campaign
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t bg-card">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5 font-bold tracking-tight">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-sm text-white">
                  <Scissors size={15} />
                </span>
                <span className="text-lg">cliptwo</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                India&apos;s clipping marketplace — connect creators with clippers, paid per view and settled straight to UPI.
              </p>
              <div className="mt-5 flex items-center gap-2">
                {(["Instagram", "YouTube"] as const).map((p) => (
                  <span key={p} className="flex h-9 w-9 items-center justify-center rounded-xl border bg-background text-muted transition-colors hover:bg-accent-soft">
                    <PlatformIcon p={p} size={16} />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-sm font-bold">Product</h5>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                <li><Link href="/clipper" className="transition-colors hover:text-foreground">For clippers</Link></li>
                <li><Link href="/creator" className="transition-colors hover:text-foreground">For creators</Link></li>
                <li><a href="#how" className="transition-colors hover:text-foreground">How it works</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-bold">Company</h5>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                <li><Link href="/login" className="transition-colors hover:text-foreground">Log in</Link></li>
                <li><a href="#" className="transition-colors hover:text-foreground">About</a></li>
                <li><a href="#" className="transition-colors hover:text-foreground">Careers</a></li>
                <li><a href="#" className="transition-colors hover:text-foreground">Blog</a></li>
                <li><a href="#" className="transition-colors hover:text-foreground">Contact</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-bold">Legal</h5>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                <li><Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link></li>
                <li><Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link></li>
                <li><Link href="/payout-policy" className="transition-colors hover:text-foreground">Payout policy</Link></li>
                <li><Link href="/content-policy" className="transition-colors hover:text-foreground">Content policy</Link></li>
                <li><Link href="/community-guidelines" className="transition-colors hover:text-foreground">Community guidelines</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t pt-8 text-xs text-muted sm:flex-row sm:items-center">
            <p>&copy; {new Date().getFullYear()} cliptwo.</p>
            <p>Made for creators &amp; clippers across India.</p>
          </div>
        </div>
      </footer>

      <CampaignModal campaign={active} onClose={() => setActive(null)} />
    </main>
  );
}
