"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Scissors,
  Film,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  IndianRupee,
  Zap,
  Bell,
  FileText,
  Upload,
  BarChart3,
  Play,
  Ban,
  Check,
  Send,
  ChevronDown,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PlatformIcon } from "@/components/PlatformIcon";
import { CampaignCard } from "@/components/CampaignCard";
import { CampaignModal } from "@/components/CampaignModal";
import type { Campaign } from "@/lib/types";

const NICHES = ["Podcast", "Gaming", "Finance", "Comedy", "Fitness", "Tech"];

const STATS = [
  { num: "1.8L", label: "verified views tracked" },
  { num: "220+", label: "active clippers" },
  { num: "38", label: "live campaigns" },
  { num: "₹9.4L", label: "paid out to clippers" },
];

const TICKER = ["Find campaigns", "Cut clips", "Post online", "Get paid over UPI"];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Verified before payable",
    body: "View counts are pulled from the platform API, not self-reported, before anything is marked payable.",
  },
  {
    icon: Zap,
    title: "Fast payout cycles",
    body: "Payout cycles close often — clippers aren't left waiting weeks for money they've already earned.",
  },
  {
    icon: IndianRupee,
    title: "UPI-native",
    body: "Every payout lands directly in a linked UPI account, no manual bank transfer chasing.",
  },
];

const FAQS = [
  {
    q: "How do campaigns work?",
    a: "Creators fund a campaign at a fixed CPM rate. Clippers browse live campaigns, cut clips from the source footage, post to their own accounts, and submit the link. Once views are verified, earnings are calculated automatically.",
  },
  {
    q: "How much can I earn as a clipper?",
    a: "It depends on the campaign's CPM and how many views your clips generate. CPM rates vary by niche — you'll see the exact rate before you claim a campaign, so there's never a surprise.",
  },
  {
    q: "When do I get paid?",
    a: "Once a submitted clip is approved and views are verified, earnings move to your payout queue. Payouts are settled directly to your UPI ID.",
  },
  {
    q: "Which platforms are supported?",
    a: "Instagram Reels, YouTube Shorts, and TikTok. Post to whichever platform fits the campaign guidelines and paste the link back into the app.",
  },
  {
    q: "Is there a fee?",
    a: "The platform takes a small fee from the creator's campaign budget, not from clipper earnings. Full pricing is published before launch.",
  },
];

const CLIPPER_JOURNEY = [
  { num: "01", label: "Pick a campaign", title: "Browse live campaigns", body: "See the exact rate, platforms, and minimum views up front. No applications, no waiting to get accepted — claim it and start cutting.", visual: "campaigns" },
  { num: "02", label: "Connect accounts", title: "Link where you post", body: "Connect your Instagram, YouTube, or TikTok once. Every view on a linked account gets tracked back to you automatically — nothing to self-report.", visual: "connect" },
  { num: "03", label: "Add your UPI ID", title: "Set up your payout", body: "Add the UPI ID you want earnings sent to. One-time setup, verified in seconds, used for every campaign after.", visual: "payout" },
  { num: "04", label: "Post & submit", title: "Drop your clip, paste the link", body: "Cut the clip, post it from your linked account, then paste the link back. Views start counting straight away.", visual: "submit" },
  { num: "05", label: "Cash out", title: "Get paid per verified view", body: "When the payout cycle closes, verified earnings settle straight to your UPI ID — no invoices, no chasing anyone down.", visual: "cashout" },
];

const CREATOR_JOURNEY = [
  { num: "01", label: "Launch a campaign", title: "Set your rate and budget", body: "Pick a CPM, set a total budget, upload your source footage and guidelines. The campaign goes live for clippers immediately.", visual: "launch" },
  { num: "02", label: "Clippers claim it", title: "Watch submissions come in", body: "Clippers browse by niche and CPM, claim your brief, and start cutting — no vetting queue on your end unless you want one.", visual: "submissions" },
  { num: "03", label: "Approve what fits", title: "Review before anything is payable", body: "Every submitted link is checked against your guidelines. Approve the ones that fit — nothing gets paid until views are verified.", visual: "review" },
  { num: "04", label: "Pay only for real views", title: "Budget spends only on verified reach", body: "Your budget only depletes as views are verified. If a clip underperforms, you simply don't pay for it.", visual: "budget" },
];

const CAMPAIGN_PREVIEW = [
  { title: "The Grind Podcast — Ep. 143", niche: "Podcast", cpm: 220 },
  { title: "Valorant Ranked Grind", niche: "Gaming", cpm: 160 },
  { title: "Money Mindset Series", niche: "Finance", cpm: 280 },
];

function fmtINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="absolute -inset-8 -z-10 rounded-3xl bg-gradient-to-br from-accent-soft to-card" />
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2.5 py-1 text-xs font-medium text-green">
            <Zap size={11} /> Live
          </span>
          <span className="font-mono text-xs text-muted">CPM {fmtINR(220)}</span>
        </div>
        <div className="mt-4 flex h-32 items-center justify-center rounded-xl bg-accent-soft">
          <Play />
        </div>
        <p className="mt-4 font-medium">The Grind Podcast — Ep. 142</p>
        <p className="text-xs text-muted">Podcast · by Rohan Malhotra</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Clips", "14"],
            ["Views", "1.8L"],
            ["Paid", "₹18.4K"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-accent-soft p-2.5 text-center">
              <p className="text-[10px] text-muted">{l}</p>
              <p className="font-mono text-sm font-medium">{v}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full w-[46%] rounded-full bg-accent" />
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-muted">₹18,400 / ₹40,000 spent</p>
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
              <span className="font-mono text-sm font-medium text-amber">{fmtINR(c.cpm)}</span>
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
          ["@clipsdaily.in", "TikTok", "connecting"],
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
        <div className="flex gap-2">
          {["Instagram", "YouTube", "TikTok"].map((n, i) => (
            <span key={n} className={`rounded-full border px-3 py-1 text-xs font-medium ${i === 0 ? "border-accent bg-accent text-white" : "text-muted"}`}>
              {n}
            </span>
          ))}
        </div>
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
                <td className="px-4 py-2.5 text-right font-mono">{fmtINR(a as number)}</td>
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
        <p className="mt-3 text-xs text-muted">Only verified views draw down your budget — nothing pays out on a guess.</p>
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
  const [open, setOpen] = useState(0);
  return (
    <div className="mx-auto max-w-2xl divide-y border-t">
      {FAQS.map((f, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            className="flex w-full items-center justify-between py-4 text-left text-[15px] font-medium"
          >
            {f.q}
            <ChevronDown size={18} className={`text-muted transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="pb-4 text-sm leading-relaxed text-muted">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { campaigns, siteSettings } = useStore();
  const [active, setActive] = useState<Campaign | null>(null);
  const showFeatured = true;

  const heroTitle =
    siteSettings.heroTitle || "Get paid to post for India's biggest creators";
  const heroSubtitle =
    siteSettings.heroSubtitle ||
    "cliptwo connects creators who have long-form content with clippers who cut it into clips — paid per verified view, settled straight to UPI.";

  const featuredIds = siteSettings.featuredIds;
  const featured = showFeatured
    ? featuredIds.length
      ? campaigns.filter((c) => featuredIds.includes(c.id))
      : campaigns.filter((c) => c.status === "open").slice(0, 4)
    : [];

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
              Sign in
            </Link>
            <Link href="/creator" className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted">
            <Sparkles size={13} /> India&apos;s clipping marketplace
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            {heroTitle}
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted">
            {heroSubtitle}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/clipper" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
              Start clipping <Scissors size={14} />
            </Link>
            <Link href="/creator" className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-accent-soft">
              Launch a campaign <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-green" /> Verified before payable</span>
            <span className="flex items-center gap-1.5"><IndianRupee size={14} className="text-amber" /> UPI-native payouts</span>
          </div>
        </div>
        <HeroVisual />
      </section>

      <section className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-6 pb-4 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-5 text-center">
            <p className="font-mono text-2xl font-medium">{s.num}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </section>

      <div className="mt-6 border-y bg-card">
        <div className="overflow-hidden">
          <div className="flex w-max animate-ticker">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="flex items-center gap-2 px-8 text-xs font-semibold uppercase tracking-wide text-muted">
                <span className="text-accent">●</span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Built for these niches, and every platform that matters
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {NICHES.map((n) => (
            <span key={n} className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <Sparkles size={13} className="text-muted" /> {n}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="Instagram" size={15} /> Reels</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="YouTube" size={15} /> Shorts</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-muted"><PlatformIcon p="TikTok" size={15} /> TikTok</span>
        </div>
      </div>

      <section id="how" className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">How it works</p>
        <h2 className="mx-auto mt-3 max-w-xl text-center text-3xl font-semibold tracking-tight">One loop, two sides.</h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-[15px] leading-relaxed text-muted">
          The platform&apos;s only job is to run this loop reliably — without either side chasing the other for money or footage.
        </p>
        <div className="mt-10">
          <Journey />
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Features</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                From campaign to cash out.<br />All in one place.
              </h2>
            </div>
            <Link href="/creator" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
              Explore the dashboard →
            </Link>
          </div>

          <div className="mt-10 grid auto-rows-[minmax(150px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {/* Hero feature: Track progress */}
            <div className="group relative overflow-hidden rounded-2xl border border-transparent bg-foreground p-6 text-white transition-transform hover:-translate-y-0.5 lg:col-span-4">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
              <div className="relative flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                  <BarChart3 size={17} />
                </span>
                <h4 className="text-[15px] font-medium">Track progress</h4>
              </div>
              <p className="relative mt-3 max-w-sm text-[13px] leading-relaxed text-white/60">
                Watch every upload, approval, and payout in one dashboard — live views, earnings, and status at a glance.
              </p>
              <div className="relative mt-6 grid grid-cols-3 gap-3">
                {[
                  ["1.8L", "views"],
                  ["₹9.4L", "paid out"],
                  ["220+", "clippers"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-white/5 p-3">
                    <p className="font-mono text-lg font-medium">{v}</p>
                    <p className="text-[11px] text-white/50">{l}</p>
                  </div>
                ))}
              </div>
              <div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-[68%] rounded-full bg-white" />
              </div>
            </div>

            {/* Campaign alerts */}
            <div className="rounded-2xl border bg-background p-5 transition-transform hover:-translate-y-0.5 lg:col-span-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-foreground">
                <Bell size={17} />
              </span>
              <h4 className="mt-4 text-[15px] font-medium">Campaign alerts</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Get notified the moment a campaign in your niche goes live.
              </p>
              <div className="mt-4 space-y-2">
                {["Podcast · ₹220 CPM", "Gaming · ₹160 CPM"].map((t) => (
                  <div key={t} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-green" />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Clear briefs */}
            <div className="rounded-2xl border bg-background p-5 transition-transform hover:-translate-y-0.5 lg:col-span-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-foreground">
                <FileText size={17} />
              </span>
              <h4 className="mt-4 text-[15px] font-medium">Clear briefs</h4>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                See CPM, budget, and full guidelines before you start cutting.
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {["CPM", "Budget", "Niches", "Guidelines"].map((t) => (
                  <span key={t} className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Easy submissions */}
            <div className="rounded-2xl border bg-background p-5 transition-transform hover:-translate-y-0.5 sm:col-span-2 lg:col-span-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-foreground">
                  <Upload size={17} />
                </span>
                <h4 className="text-[15px] font-medium">Easy submissions</h4>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Add Instagram, YouTube, or TikTok links in a couple of clicks.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted">
                  <PlatformIcon p="Instagram" size={14} /> instagram.com/reel/…
                </div>
                <button className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
                  <Send size={13} /> Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showFeatured && (
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Live now</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Featured campaigns</h2>
          </div>
          <button
            onClick={() => router.push("/campaigns")}
            className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent-soft"
          >
            Browse all <ArrowRight size={15} />
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((c, i) => (
            <CampaignCard key={c.id} campaign={c} index={i} onView={setActive} />
          ))}
        </div>
      </section>
      )}

      <section id="why" className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Why cliptwo</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">Trust is the product.</h2>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
          Clipping platforms live or die on whether clippers believe they&apos;ll actually get paid. These are the mechanics that make that a promise, not a claim.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.title} className="rounded-2xl border bg-card p-5">
              <t.icon size={22} className="text-green" />
              <h4 className="mt-3 text-[15px] font-medium">{t.title}</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{t.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between">
            <h4 className="text-[15px] font-medium">A fairer cut</h4>
            <span className="text-xs text-muted">Illustrative — final take rate to be confirmed at launch</span>
          </div>
          <div className="mt-5 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-sm"><span className="w-24 text-muted">cliptwo</span><span className="font-mono">9%</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft"><div className="h-full w-[9%] rounded-full bg-accent" /></div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-sm"><span className="w-24 text-muted">Typical agency</span><span className="font-mono">45%</span></div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-accent-soft"><div className="h-full w-[45%] rounded-full bg-border" /></div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="border-y bg-card">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-muted">FAQ</p>
          <h2 className="mx-auto mt-3 max-w-xl text-center text-3xl font-semibold tracking-tight">Frequently asked</h2>
          <div className="mt-10">
            <FAQ />
          </div>
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs text-white">
                  <Scissors size={13} />
                </span>
                cliptwo
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
                India&apos;s clipping marketplace — connect creators with clippers, paid per verified view and settled straight to UPI.
              </p>
              <div className="mt-4 flex items-center gap-2">
                {["ig", "yt", "tt"].map((p) => (
                  <span key={p} className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-muted">
                    <PlatformIcon p={p} size={15} />
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h5 className="text-sm font-semibold">Product</h5>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><Link href="/clipper" className="hover:text-foreground">For clippers</Link></li>
                <li><Link href="/creator" className="hover:text-foreground">For creators</Link></li>
                <li><a href="#how" className="hover:text-foreground">How it works</a></li>
                <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-semibold">Company</h5>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><Link href="/login" className="hover:text-foreground">Sign in</Link></li>
                <li><a href="#" className="hover:text-foreground">About</a></li>
                <li><a href="#" className="hover:text-foreground">Careers</a></li>
                <li><a href="#" className="hover:text-foreground">Blog</a></li>
                <li><a href="#" className="hover:text-foreground">Contact</a></li>
              </ul>
            </div>

            <div>
              <h5 className="text-sm font-semibold">Legal</h5>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li><a href="#" className="hover:text-foreground">Terms</a></li>
                <li><a href="#" className="hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground">Payout policy</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} cliptwo. Prototype build — not a live payments product.</p>
            <p>Made for creators &amp; clippers across India.</p>
          </div>
        </div>
      </footer>

      {showFeatured && <CampaignModal campaign={active} onClose={() => setActive(null)} />}
    </main>
  );
}
