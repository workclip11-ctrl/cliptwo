"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";

function AccordionItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium hover:text-accent transition-colors"
      >
        {question}
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-muted">{answer}</p>
      )}
    </div>
  );
}

function Category({
  title,
  items,
}: {
  title: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="rounded-xl border bg-card px-5">
        {items.map((item) => (
          <AccordionItem key={item.q} question={item.q} answer={item.a} />
        ))}
      </div>
    </section>
  );
}

const clipperFAQ = [
  {
    q: "How do I make money?",
    a: "Browse open campaigns, create a short-form clip from the source material, and post it on your social account. You earn money for every 1,000 views your clip receives, at the campaign's CPM rate. A 10% platform fee is deducted from gross earnings.",
  },
  {
    q: "Do I need followers?",
    a: "No. There is no minimum follower count. Your earnings depend on clip quality and view count, not your follower count. A clip from a new account can earn just as much as one from a large account.",
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
    a: "You'll receive a specific reason (e.g., wrong format, missing CTA, policy violation). You can fix the issue and resubmit, or appeal if you believe the rejection was unfair. Repeated rejections affect your reputation score.",
  },
  {
    q: "Can I join multiple campaigns?",
    a: "Yes. You can submit clips to as many campaigns as you want, as long as each clip follows the specific campaign brief. You cannot submit the same clip to multiple campaigns without permission.",
  },
];

const creatorFAQ = [
  {
    q: "How do I launch a campaign?",
    a: "Go to Creator → Campaigns → New Campaign. Fill in the brief, upload source material, set your budget and CPM rate, and publish. Your campaign will appear on the marketplace for clippers to browse.",
  },
  {
    q: "How much does it cost?",
    a: "You set your own budget (total spend) and CPM rate (per 1,000 views). You only pay for approved views your clips receive. There are no upfront fees — you pay as clips earn.",
  },
  {
    q: "How is CPM determined?",
    a: "You choose the CPM rate when creating the campaign. Higher CPMs attract more clippers and better-quality clips. Industry benchmarks vary by niche — [PLACEHOLDER: CPM guidance by niche to be added.]",
  },
  {
    q: "How are views counted?",
    a: "When a clipper submits a clip, they paste the link to their post. Our team reviews each submission for quality and authenticity. View counts are tracked from the linked post — clippers report the URL, we verify the content meets your campaign guidelines.",
  },
  {
    q: "How are clips reviewed?",
    a: "Our admin team reviews each submitted clip and approves or rejects it with a reason. Approved clips go live and start earning. Rejected clips don't earn, and the clipper receives feedback.",
  },
  {
    q: "What happens when the budget is exhausted?",
    a: "When your budget is fully committed (spent + pending payable ≥ budget), the campaign status changes to \"Budget Reached\" and new submissions are blocked. You'll be notified and can increase the budget to reopen.",
  },
  {
    q: "Can I reuse submitted clips?",
    a: "Clippers retain ownership of their creative edits. You get a license to use approved clips for the campaign purpose. Reusing clips outside the campaign or without the clipper's consent is not allowed.",
  },
];

const paymentFAQ = [
  {
    q: "How does UPI work?",
    a: "UPI (Unified Payments Interface) is the default payout method. You link your UPI ID in your profile settings. Payouts are sent directly to your UPI-linked bank account. [PLACEHOLDER: Supported UPI apps to be listed.]",
  },
  {
    q: "What are the fees?",
    a: "ClipTwo charges a 10% platform fee on gross earnings. This covers payment processing, platform maintenance, and support. There are no additional hidden fees.",
  },
  {
    q: "What is the minimum payout?",
    a: "[PLACEHOLDER: Minimum payout threshold to be confirmed — e.g., ₹500. Amounts below the threshold roll over to the next payout cycle.]",
  },
  {
    q: "How long do payouts take?",
    a: "Once a payout is initiated, it typically takes 3–5 business days to reach your account, depending on your payment provider. You'll receive a notification when the payout is confirmed.",
  },
  {
    q: "What happens when a payout fails?",
    a: "If a payout fails (e.g., wrong UPI ID, bank issue), the amount stays in your wallet and is retried in the next payout cycle. You'll be notified to update your payment details if needed.",
  },
];

const safetyFAQ = [
  {
    q: "How do you detect fake views?",
    a: "Every clip submission is reviewed by our team. We check that the content matches the campaign brief, the link is valid, and the post is genuine. Suspicious or low-quality submissions are rejected.",
  },
  {
    q: "What happens to suspicious earnings?",
    a: "Earnings flagged as suspicious are frozen pending investigation. If fraud is confirmed, the affected clips are removed and the earnings are forfeited. Your account may be suspended or permanently banned.",
  },
  {
    q: "What happens if a post is deleted?",
    a: "If your clip is deleted from social media, view tracking stops. Earnings up to the point of deletion are preserved, but no new views will be counted. Repeated deletions may trigger a review.",
  },
  {
    q: "How do appeals work?",
    a: "If you believe a rejection or moderation action was unfair, submit an appeal through the platform (Submissions → View clip → Appeal). Provide evidence and our team will review within 5 business days.",
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen bg-background">
      <TopBar />
      <section className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Help Center
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Frequently Asked Questions
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
          Everything you need to know about clipping, creating campaigns, and
          getting paid on ClipTwo.
        </p>

        <div className="mt-10 space-y-10">
          <Category title="For Clippers" items={clipperFAQ} />
          <Category title="For Creators" items={creatorFAQ} />
          <Category title="Payments" items={paymentFAQ} />
          <Category title="Trust & Safety" items={safetyFAQ} />
        </div>

        <div className="mt-12 rounded-xl border bg-card p-6">
          <p className="text-sm text-muted">
            Still have questions?{" "}
            <a
              href="mailto:support@cliptwo.com"
              className="font-medium text-accent hover:underline"
            >
              Contact support
            </a>{" "}
            — we&apos;re happy to help.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm text-muted">
          <Link
            href="/payout-policy"
            className="hover:text-foreground transition-colors"
          >
            Payout Policy
          </Link>
          <Link
            href="/clipper-rules"
            className="hover:text-foreground transition-colors"
          >
            Clipper Rules
          </Link>
          <Link
            href="/creator-rules"
            className="hover:text-foreground transition-colors"
          >
            Creator Rules
          </Link>
          <Link
            href="/content-policy"
            className="hover:text-foreground transition-colors"
          >
            Content Policy
          </Link>
          <Link
            href="/community-guidelines"
            className="hover:text-foreground transition-colors"
          >
            Community Guidelines
          </Link>
        </div>
      </section>
    </main>
  );
}
