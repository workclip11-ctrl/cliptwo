"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Scissors,
  Film,
  ShieldCheck,
  IndianRupee,
  Check,
  Send,
  ChevronDown,
  BadgeCheck,
  ArrowRight,
  Eye,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PlatformIcon } from "@/components/PlatformIcon";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignModal } from "@/components/CampaignModal";
import { rup } from "@/lib/format";

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
        a: "Earnings move through: Pending → Processing → Paid. Once your clip is approved and the admin initiates payout, the money is sent to your UPI account.",
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
        q: "How are clips reviewed?",
        a: "Our admin team reviews each submitted clip and approves or rejects it with a reason. Approved clips go live and start earning.",
      },
      {
        q: "What happens when the budget is exhausted?",
        a: 'When your budget is fully committed, the campaign status changes to "Budget Reached" and new submissions are blocked. You can increase the budget to reopen the campaign.',
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

function JourneyVisual({ stageKey }: { stageKey: string }) {
  if (stageKey === "campaigns") {
    return (
      <div className="space-y-2.5">
        {[
          { title: "Podcast clips — Ep. 143", niche: "Podcast", cpm: 220, platform: "Instagram" as const },
          { title: "Valorant ranked montage", niche: "Gaming", cpm: 160, platform: "YouTube" as const },
        ].map((c) => (
          <div key={c.title} className="flex items-center gap-3 rounded-[10px] border border-border/40 bg-background px-4 py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft">
              <PlatformIcon p={c.platform} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{c.title}</p>
              <p className="text-[12px] text-muted">{c.niche}</p>
            </div>
            <span className="font-mono text-[14px] font-semibold">{rup(c.cpm)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "connect") {
    return (
      <div className="space-y-2">
        {[
          { handle: "@thegrindclips", platform: "Instagram" as const, verified: true },
          { handle: "@editzbypriya", platform: "YouTube" as const, verified: true },
        ].map((a) => (
          <div key={a.handle} className="flex items-center justify-between rounded-[10px] border border-border/40 bg-background px-4 py-3">
            <span className="flex items-center gap-2.5">
              <PlatformIcon p={a.platform} size={16} />
              <span className="font-mono text-[14px]">{a.handle}</span>
            </span>
            <span className="flex items-center gap-1 text-[12px] font-medium text-green">
              <BadgeCheck size={13} /> Verified
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "payout") {
    return (
      <div className="rounded-[10px] border border-border/40 bg-background p-4">
        <div className="flex items-center gap-2 font-mono text-[14px]">
          <IndianRupee size={15} className="text-amber" />
          priya@okhdfcbank
          <BadgeCheck size={14} className="ml-auto text-green" />
        </div>
        <p className="mt-2 text-[13px] text-muted">
          Payouts settle here when a cycle closes.
        </p>
      </div>
    );
  }
  if (stageKey === "submit") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-[10px] border border-border/40 bg-background px-4 py-3 text-[13px] text-muted">
          instagram.com/reel/xk29a
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-[8px] bg-foreground px-4 py-2 text-[13px] font-medium text-background">
          <Send size={13} /> Submit for review
        </button>
      </div>
    );
  }
  if (stageKey === "cashout") {
    return (
      <div className="overflow-hidden rounded-[10px] border border-border/40">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border/30 text-left text-[12px] text-muted">
              <th className="px-4 py-2.5 font-medium">Campaign</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {[
              ["Podcast · Aug", "paid", 4048],
              ["Finance · Aug", "pending", 1820],
            ].map(([c, s, a]) => (
              <tr key={c as string}>
                <td className="px-4 py-2.5">{c}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[12px] font-medium ${s === "paid" ? "text-green" : "text-amber"}`}>{s}</span>
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
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between rounded-[10px] border border-border/40 bg-background px-4 py-2.5 text-[13px]">
            <span className="text-muted">{k}</span>
            <span className="font-mono font-medium">{v}</span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "submissions") {
    return (
      <div className="space-y-2">
        {[
          { name: "Priya Nair", status: "approved" },
          { name: "Dev Shah", status: "pending" },
        ].map((s) => (
          <div key={s.name} className="flex items-center justify-between rounded-[10px] border border-border/40 bg-background px-4 py-3 text-[13px]">
            <span className="font-medium">{s.name}</span>
            <span className={`text-[12px] font-medium ${s.status === "approved" ? "text-green" : "text-amber"}`}>{s.status}</span>
          </div>
        ))}
      </div>
    );
  }
  if (stageKey === "review") {
    return (
      <div className="flex items-center justify-between rounded-[10px] border border-border/40 bg-background px-4 py-3 text-[13px]">
        <span className="flex items-center gap-2">
          <span className="font-medium">Arjun Rao</span>
          <span className="font-mono text-[12px] text-muted">reel/pw001</span>
        </span>
        <span className="flex gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-border/60 text-green"><Check size={14} /></span>
          <span className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-border/60 text-red"><AlertTriangle size={14} /></span>
        </span>
      </div>
    );
  }
  if (stageKey === "budget") {
    return (
      <div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full w-[46%] rounded-full bg-foreground" />
        </div>
        <p className="mt-1.5 font-mono text-[12px] text-muted">₹18,400 / ₹40,000 spent</p>
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
      <div className="inline-flex rounded-[10px] border border-border/40 bg-card p-1">
        <button
          onClick={() => { setTab("clipper"); setStep(0); }}
          className={`flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer ${tab === "clipper" ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
        >
          <Scissors size={14} /> I&apos;m a clipper
        </button>
        <button
          onClick={() => { setTab("creator"); setStep(0); }}
          className={`flex items-center gap-1.5 rounded-[8px] px-4 py-2 text-[14px] font-medium transition-colors cursor-pointer ${tab === "creator" ? "bg-foreground text-background" : "text-muted hover:text-foreground"}`}
        >
          <Film size={14} /> I&apos;m a creator
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col">
          {journey.map((s, i) => (
            <button
              key={s.num}
              onClick={() => setStep(i)}
              className={`border-l-2 py-3 pl-4 text-left transition-colors cursor-pointer ${i === step ? "border-foreground" : "border-border/40"}`}
            >
              <span className={`font-mono text-[11px] ${i === step ? "text-foreground" : "text-muted"}`}>{s.num}</span>
              <span className={`block text-[14px] font-medium ${i === step ? "text-foreground" : "text-muted"}`}>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="rounded-[14px] border border-border/40 bg-card p-6">
          <h3 className="text-[18px] font-bold tracking-tight">{stage.title}</h3>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">{stage.body}</p>
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
      <div className="mx-auto mb-8 flex w-fit gap-1 rounded-[10px] border border-border/40 bg-card p-1">
        {FAQ_CATEGORIES.map((c) => (
          <button
            key={c.title}
            onClick={() => { setTab(c.title); setOpen(null); }}
            className={`rounded-[8px] px-5 py-2 text-[14px] font-medium transition-colors cursor-pointer ${
              tab === c.title ? "bg-foreground text-background" : "text-muted hover:text-foreground"
            }`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="divide-y divide-border/30 rounded-[14px] border border-border/40 bg-card">
        {cat.items.map((f) => (
          <div key={f.q}>
            <button
              onClick={() => setOpen(open === f.q ? null : f.q)}
              className="flex w-full items-center justify-between px-6 py-5 text-left text-[15px] font-medium cursor-pointer"
            >
              {f.q}
              <ChevronDown
                size={18}
                className={`shrink-0 text-muted transition-transform duration-200 ${open === f.q ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                open === f.q ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <p className="px-6 pb-5 text-[14px] leading-relaxed text-muted">
                {f.a}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { campaigns, siteSettings } = useStore();
  const [active, setActive] = useState<Campaign | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration > 0) {
      setProgress((v.currentTime / v.duration) * 100);
    }
  }, []);

  const handlePlayStateChange = useCallback(() => {
    const v = videoRef.current;
    if (v) setIsPlaying(!v.paused);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const heroTitle =
    siteSettings.heroTitle || "Turn creator content into clips. Get paid for the views.";
  const heroSubtitle =
    siteSettings.heroSubtitle ||
    "cliptwo connects creators who have long-form content with clippers who cut it into clips — paid per verified view, settled straight to UPI.";

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

  return (
    <main className="min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight cursor-pointer">
            <img src="/cliptwo-logo.png" alt="ClipTwo" className="h-8 w-8 rounded-[8px] object-contain" />
            <span className="text-[17px]">cliptwo</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14px] text-muted md:flex">
            <a href="#how" className="transition-colors hover:text-foreground cursor-pointer">How it works</a>
            <a href="#why" className="transition-colors hover:text-foreground cursor-pointer">Why cliptwo</a>
            <a href="#faq" className="transition-colors hover:text-foreground cursor-pointer">FAQ</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="rounded-[8px] border border-border/60 px-4 py-2 text-[14px] font-medium transition-colors hover:bg-accent-soft cursor-pointer">
              Log in
            </Link>
            <Link href="/login?mode=signup" className="rounded-[8px] bg-foreground px-4 py-2 text-[14px] font-medium text-background transition-opacity hover:opacity-90 cursor-pointer">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto grid max-w-[1120px] gap-16 px-6 py-24 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-card px-3.5 py-1 text-[12px] font-medium text-muted">
            India&apos;s clipping marketplace
          </span>
          <h1 className="mt-7 text-[36px] font-bold tracking-tight leading-[1.15] sm:text-[44px] lg:text-[52px]">
            {heroTitle}
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted">
            {heroSubtitle}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login?role=clipper" className="inline-flex h-12 items-center gap-2.5 rounded-[10px] bg-foreground px-7 text-[15px] font-semibold text-background transition-opacity hover:opacity-90 cursor-pointer">
              <Scissors size={16} /> Start clipping
            </Link>
            <Link href="/login?role=creator" className="inline-flex h-12 items-center gap-2.5 rounded-[10px] border border-border/60 bg-card px-7 text-[15px] font-semibold transition-colors hover:bg-accent-soft cursor-pointer">
              <Film size={16} /> Launch a campaign
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-6 text-[14px] text-muted">
            <span className="flex items-center gap-2"><ShieldCheck size={16} className="text-green" /> Admin-reviewed clips</span>
            <span className="flex items-center gap-2"><IndianRupee size={16} className="text-amber" /> UPI-native payouts</span>
          </div>
        </div>

        {/* Phone mockup — Reel playing inside phone */}
        <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
          <div className="group relative mx-auto w-[260px] sm:w-[280px]">
            {/* Phone body */}
            <div className="relative overflow-hidden rounded-[2.5rem] border border-border/30 bg-black shadow-2xl shadow-black/10">
              {/* Notch */}
              <div className="absolute left-1/2 top-0 z-20 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />

              {/* Screen — 9:16 Reel */}
              <div className="relative aspect-[9/19] overflow-hidden bg-gradient-to-b from-slate-900 to-slate-800">
                {/* Reel video — fills entire screen */}
                <video
                  ref={videoRef}
                  src="/hero-reel.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlayStateChange}
                  onPause={handlePlayStateChange}
                  onLoadedMetadata={handleTimeUpdate}
                  onEnded={handlePlayStateChange}
                  className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

                {/* Live progress bar */}
                <div className="absolute inset-x-3 bottom-16 z-10">
                  <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white/80"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Play/pause control — visible on hover, functional */}
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 z-10 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 cursor-pointer"
                  aria-label={isPlaying ? "Pause video" : "Play video"}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                    {isPlaying ? (
                      <Pause className="h-6 w-6 text-white" />
                    ) : (
                      <Play className="ml-0.5 h-6 w-6 text-white" />
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Floating card — Views */}
            <div className="absolute -right-10 top-20 z-30 w-[120px] rounded-[12px] border border-border/20 bg-white p-3 shadow-lg shadow-black/8 sm:-right-14 sm:w-[130px]">
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-blue-500/10">
                  <Eye size={11} className="text-blue-500" />
                </span>
                <span className="text-[10px] font-medium text-muted">Views</span>
              </div>
              <p className="mt-1.5 font-mono text-[18px] font-bold tracking-tight">24.8K</p>
            </div>

            {/* Floating card — Earned */}
            <div className="absolute -left-10 bottom-28 z-30 w-[120px] rounded-[12px] border border-border/20 bg-white p-3 shadow-lg shadow-black/8 sm:-left-14 sm:w-[130px]">
              <div className="flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-green/10">
                  <IndianRupee size={11} className="text-green" />
                </span>
                <span className="text-[10px] font-medium text-muted">Earned</span>
              </div>
              <p className="mt-1.5 font-mono text-[18px] font-bold tracking-tight">₹4,960</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="border-y border-border/30 bg-card">
        <div className="overflow-hidden">
          <div className="flex w-max animate-ticker">
            {[...TICKER, ...TICKER, ...TICKER, ...TICKER, ...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="flex items-center gap-2 px-8 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span className="text-foreground/30">●</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Platforms ── */}
      <div className="mx-auto max-w-[1120px] px-6 py-12 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Built for every niche, and every platform that matters
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {NICHES.map((n) => (
            <span key={n} className="text-[13px] font-medium text-muted">{n}</span>
          ))}
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted"><PlatformIcon p="Instagram" size={14} /> Instagram</span>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted"><PlatformIcon p="YouTube" size={14} /> YouTube</span>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted/50"><PlatformIcon p="Kick" size={14} /> Kick <span className="text-[10px]">(coming soon)</span></span>
        </div>
      </div>

      {/* ── How it works ── */}
      <section id="how" className="mx-auto max-w-[1120px] px-6 py-24">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted">How it works</p>
        <h2 className="mx-auto mt-4 max-w-xl text-center text-[32px] font-bold tracking-tight sm:text-[40px]">One loop, two sides.</h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-[16px] leading-relaxed text-muted">
          The platform&apos;s only job is to run this loop reliably — without either side chasing the other for money or footage.
        </p>
        <div className="mt-14">
          <Journey />
        </div>
      </section>

      {/* ── Live campaigns ── */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-[1120px] px-6 py-24">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Live now</p>
              <h2 className="mt-4 text-[32px] font-bold tracking-tight sm:text-[40px]">Active campaigns</h2>
            </div>
            <button
              onClick={() => router.push("/campaigns")}
              className="inline-flex h-10 items-center gap-1.5 rounded-[8px] border border-border/60 bg-card px-5 text-[14px] font-semibold transition-colors hover:bg-accent-soft cursor-pointer"
            >
              Browse all <ArrowRight size={14} />
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
      <section id="why" className="border-y border-border/30 bg-card">
        <div className="mx-auto max-w-[1120px] px-6 py-24">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Why cliptwo</p>
          <h2 className="mt-4 text-[32px] font-bold tracking-tight sm:text-[40px]">Trust is the product.</h2>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted">
            Clipping platforms live or die on whether clippers believe they&apos;ll actually get paid. These are the mechanics that make that a promise, not a claim.
          </p>
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="py-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-soft">
                  <t.icon size={18} className="text-foreground" />
                </div>
                <h4 className="mt-4 text-[16px] font-bold tracking-tight">{t.title}</h4>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="mx-auto max-w-[1120px] px-6 py-24">
        <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted">FAQ</p>
        <h2 className="mx-auto mt-4 max-w-xl text-center text-[32px] font-bold tracking-tight sm:text-[40px]">Frequently asked</h2>
        <div className="mt-14">
          <FAQ />
        </div>
        <div className="mx-auto mt-14 max-w-2xl rounded-[14px] border border-border/40 bg-card p-8 text-center">
          <h3 className="text-[18px] font-bold tracking-tight">Still have questions?</h3>
          <p className="mt-2 text-[14px] text-muted">
            Can&apos;t find what you&apos;re looking for? Reach out to our support team and we&apos;ll get back to you.
          </p>
          <a
            href="mailto:support@cliptwo.com"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-[8px] bg-foreground px-5 text-[14px] font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
          >
            Contact Support
          </a>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="border-y border-border/30 bg-card">
        <div className="mx-auto max-w-[1120px] px-6 py-24 text-center">
          <h2 className="text-[32px] font-bold tracking-tight sm:text-[40px]">Ready to start?</h2>
          <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-muted">
            Whether you want to earn by clipping or grow your brand through
            creator content, ClipTwo is where it happens.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login?role=clipper"
              className="inline-flex h-12 items-center gap-2.5 rounded-[10px] bg-foreground px-8 text-[15px] font-semibold text-background transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Scissors size={16} /> Start clipping
            </Link>
            <Link
              href="/login?role=creator"
              className="inline-flex h-12 items-center gap-2.5 rounded-[10px] border border-border/60 bg-card px-8 text-[15px] font-semibold transition-colors hover:bg-accent-soft cursor-pointer"
            >
              <Film size={16} /> Launch a campaign
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 bg-card">
        <div className="mx-auto max-w-[1120px] px-6 py-16">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5 font-bold tracking-tight">
                <img src="/cliptwo-logo.png" alt="ClipTwo" className="h-8 w-8 rounded-[8px] object-contain" />
                <span className="text-[17px]">cliptwo</span>
              </div>
              <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted">
                India&apos;s clipping marketplace — connect creators with clippers, paid per view and settled straight to UPI.
              </p>
              <div className="mt-5 flex items-center gap-2">
                {(["Instagram", "YouTube"] as const).map((p) => (
                  <span key={p} className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-border/40 bg-background text-muted transition-colors hover:bg-accent-soft cursor-pointer">
                    <PlatformIcon p={p} size={16} />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-[13px] font-bold uppercase tracking-wider text-muted">Product</h5>
              <ul className="mt-4 space-y-2.5 text-[14px] text-muted">
                <li><Link href="/clipper" className="transition-colors hover:text-foreground cursor-pointer">For clippers</Link></li>
                <li><Link href="/creator" className="transition-colors hover:text-foreground cursor-pointer">For creators</Link></li>
                <li><a href="#how" className="transition-colors hover:text-foreground cursor-pointer">How it works</a></li>
                <li><a href="#faq" className="transition-colors hover:text-foreground cursor-pointer">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-[13px] font-bold uppercase tracking-wider text-muted">Company</h5>
              <ul className="mt-4 space-y-2.5 text-[14px] text-muted">
                <li><Link href="/login" className="transition-colors hover:text-foreground cursor-pointer">Log in</Link></li>
                <li><a href="mailto:support@cliptwo.com" className="transition-colors hover:text-foreground cursor-pointer">Contact</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-[13px] font-bold uppercase tracking-wider text-muted">Legal</h5>
              <ul className="mt-4 space-y-2.5 text-[14px] text-muted">
                <li><Link href="/terms" className="transition-colors hover:text-foreground cursor-pointer">Terms</Link></li>
                <li><Link href="/privacy" className="transition-colors hover:text-foreground cursor-pointer">Privacy</Link></li>
                <li><Link href="/payout-policy" className="transition-colors hover:text-foreground cursor-pointer">Payout policy</Link></li>
                <li><Link href="/content-policy" className="transition-colors hover:text-foreground cursor-pointer">Content policy</Link></li>
                <li><Link href="/community-guidelines" className="transition-colors hover:text-foreground cursor-pointer">Community guidelines</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/30 pt-8 text-[12px] text-muted sm:flex-row sm:items-center">
            <p>&copy; {new Date().getFullYear()} cliptwo.</p>
            <p>Made for creators &amp; clippers across India.</p>
          </div>
        </div>
      </footer>

      <CampaignModal campaign={active} onClose={() => setActive(null)} />
    </main>
  );
}
