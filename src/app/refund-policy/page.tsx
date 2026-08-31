import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Refund Policy — ClipTwo",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage title="Refund Policy" lastUpdated="August 2026">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p>
          ClipTwo operates as a marketplace connecting creators and clippers.
          This policy explains when refunds may apply and how to request one.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">For Creators</h2>
        <p>
          <strong>Budget refunds:</strong> If your campaign has not yet received
          any submissions, you may cancel it and receive a refund of your unused
          budget.           Refunds are processed within 7-10 business days to the original payment method.
        </p>
        <p className="mt-2">
          <strong>Partial refunds:</strong> If your campaign has received
          submissions, approved clips must be paid from your budget. You may
          receive a refund for the unused portion of your budget after all
          committed payouts are settled.
        </p>
        <p className="mt-2">
          <strong>No refunds:</strong> Once clips are approved and payable, no
          refund is available for those clips. The creator is obligated to pay
          for approved work.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">For Clippers</h2>
        <p>
          Clippers do not pay to use the platform. However:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>If your clip is wrongfully rejected, you may appeal through the dispute process.</li>
          <li>If a payout fails due to a platform error, we will retry or refund the amount to your wallet.</li>
          <li>Clippers are not eligible for refunds as they earn from views, not payments.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Platform Fees</h2>
        <p>
          Platform fees are non-refundable once a clip has been approved and has
          received views. Fees for clips that are rejected before
          going live are not charged.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How to Request a Refund</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Contact support at{" "}
            <a href="mailto:support@cliptwo.com" className="text-accent hover:underline">
              support@cliptwo.com
            </a>.
          </li>
          <li>Include your account email, campaign/clip ID, and reason for the refund request.</li>
          <li>Our team will review within 5 business days.</li>
          <li>If approved, the refund will be processed to your original payment method or wallet balance.</li>
        </ol>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Exceptions</h2>
        <p>
          Exceptions may apply for force majeure events or extended platform outages.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Disputes</h2>
        <p>
          If you disagree with a refund decision, you may escalate through the
          dispute process described in the{" "}
          <a href="/payout-policy" className="text-accent hover:underline">
            Payout Policy
          </a>
          .
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
