import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Creator Rules — ClipTwo",
};

export default function CreatorRulesPage() {
  return (
    <PolicyPage title="Creator Rules" lastUpdated="August 2026">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p>
          Creators are the source of content on ClipTwo. You post campaigns
          with your source material, set a budget and CPM rate, and clippers
          turn your long-form videos into engaging shorts.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Creating a Campaign</h2>
        <p>When creating a campaign, you must provide:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>A clear, detailed brief describing what clippers should create.</li>
          <li>Source material (video links, assets, brand guidelines).</li>
          <li>A budget (total amount you&apos;re willing to spend).</li>
          <li>A CPM rate (what you pay per 1,000 views).</li>
          <li>Campaign rules (duration limits, hashtags, CTAs, dos and don&apos;ts).</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Your Responsibilities</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide clear, accurate campaign briefs.</li>
          <li>Ensure source material is legal and that you have rights to it.</li>
          <li>Review submitted clips promptly (within the stated review window).</li>
          <li>Approve or reject clips with clear reasons.</li>
          <li>Maintain sufficient budget for your campaign.</li>
          <li>Respond to clipper questions in a timely manner.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What You Must NOT Do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Never reject clips without reason.</strong> Every rejection must have a valid explanation.</li>
          <li><strong>Never use clipper content without attribution</strong> or outside the campaign context.</li>
          <li><strong>Never promise payment outside the platform.</strong> All earnings go through ClipTwo.</li>
          <li><strong>Never share clipper personal information</strong> with third parties.</li>
          <li><strong>Never cancel a campaign mid-run</strong> without good reason and without paying for approved clips.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Reviewing Clips</h2>
        <p>
          You should review clips within the review window stated in your
          campaign settings. Clips left in pending status for too long may be
          auto-approved or escalated to admin review.
        </p>
        <p>When rejecting a clip, provide:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>A specific reason (from the rejection reasons list or custom).</li>
          <li>Actionable feedback so the clipper can improve.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Budget &amp; Cancellation</h2>
        <p>
          Your campaign budget is a commitment. Once clippers start submitting
          and earning, you are obligated to pay for approved clips.
        </p>
        <p>
          If you cancel a campaign:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Clips already approved and payable will still be paid from your budget.</li>
          <li>Pending clips may be rejected at admin discretion.</li>
          <li>Unused budget can be withdrawn at any time.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Campaign Cancellation</h2>
        <p>
          ClipTwo may cancel a campaign if:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>The campaign violates platform policies.</li>
          <li>The source material is illegal or infringes third-party rights.</li>
          <li>The budget cannot cover committed payouts.</li>
          <li>The campaign is flagged for fraud or abuse.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Budget Exhaustion</h2>
        <p>
          When your campaign budget is fully committed, the campaign status
          changes to &quot;Budget Reached&quot; and new submissions are blocked.
          You will be notified and can choose to increase the budget to reopen
          the campaign.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Disputes &amp; Appeals</h2>
        <p>
          If a clipper disputes a rejection, you may be asked to provide
          additional justification. Repeated unjustified rejections may result
          in review of your creator account.
        </p>
        <p>
          Disputes are resolved through our support team.
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
