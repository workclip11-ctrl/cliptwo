import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Payout Policy — ClipTwo",
};

export default function PayoutPolicyPage() {
  return (
    <PolicyPage title="Payout Policy" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How Clipping Works</h2>
        <p>
          Clippers browse open campaigns, watch the source material, and create
          short-form clips (typically 15–60 seconds). Each clip is submitted for
          review. Once approved, the clip goes live and starts earning based on
          views.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How Earnings Are Calculated</h2>
        <p>
          Earnings = (Views ÷ 1,000) × Campaign CPM Rate.
        </p>
        <p>
          For example, if a campaign pays ₹200 CPM and your clip gets 5,000
          views, you earn ₹1,000 gross.
        </p>
        <p>
          A platform fee (currently 10%) is deducted from gross earnings. The
          net amount is what you receive. See the breakdown on your wallet page.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">When Earnings Are Payable</h2>
        <p>Earnings move through these stages:</p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li><strong>Pending</strong> — clip submitted, awaiting review and approval.</li>
          <li><strong>Processing</strong> — clip approved and payout initiated by admin.</li>
          <li><strong>Paid</strong> — payout confirmed and sent to your UPI.</li>
        </ol>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">View Verification</h2>
        <p>
          Every clip submission is reviewed by our team. We check that the
          content matches the campaign brief, the link is valid, and the post
          is genuine. View counts are tracked from the linked post.
        </p>
        <p>
          Submissions may be rejected if:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>The content does not match the campaign brief.</li>
          <li>The link is invalid or points to deleted content.</li>
          <li>The clip appears to use artificial view tactics.</li>
          <li>The clip violates platform terms of service.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Payout Timing</h2>
        <p>
          [PLACEHOLDER: Payout schedule to be defined — e.g., weekly on
          Fridays, or bi-weekly. Minimum payout threshold (e.g., ₹500) to be
          confirmed.]
        </p>
        <p>
          Once a payout is initiated, it typically takes 3–5 business days to
          reach your account, depending on your payment provider.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Platform Fee</h2>
        <p>
          ClipTwo charges a platform fee on all earnings. This fee covers
          payment processing, platform maintenance, and support. The current
          fee is 10% of gross earnings.
        </p>
        <p>
          [PLACEHOLDER: Fee changes, volume discounts, or tiered pricing to be
          determined.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Campaign Cancellation</h2>
        <p>
          If a creator cancels a campaign, clips already approved and payable
          will still be paid out. Clips still in pending review at the time of
          cancellation may be rejected. [PLACEHOLDER: Exact terms for mid-run
          cancellations to be defined.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Budget Exhaustion</h2>
        <p>
          When a campaign&apos;s budget is fully committed (spent + pending
          payable earnings ≥ budget), the campaign status changes to &quot;Budget
          Reached&quot; and new submissions are blocked. Clips already approved
          before budget exhaustion are still paid.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Disputes &amp; Appeals</h2>
        <p>
          If you believe a clip was wrongly rejected or your payout is
          incorrect, you can:
        </p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>Submit an appeal through the platform (Submissions → View clip → Appeal).</li>
          <li>Provide supporting evidence (screenshots, links, etc.).</li>
          <li>Our team will review within 5 business days.</li>
        </ol>
        <p>
          [PLACEHOLDER: Escalation process, arbitration terms, and final
          dispute resolution mechanism to be defined by legal.]
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
