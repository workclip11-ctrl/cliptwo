import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Terms of Service — ClipTwo",
};

export default function TermsPage() {
  return (
    <PolicyPage title="Terms of Service" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">1. Acceptance of Terms</h2>
        <p>
          By accessing or using ClipTwo (&quot;the Platform&quot;), you agree to
          be bound by these Terms of Service. If you do not agree, do not use
          the Platform.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">2. What ClipTwo Does</h2>
        <p>
          ClipTwo is a two-sided marketplace that connects creators (who post
          long-form video campaigns) with clippers (who cut those videos into
          short-form clips). Clippers earn money based on views their
          clips receive.
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Creators post campaigns with a brief, budget, and CPM rate.</li>
          <li>Clippers browse campaigns, submit clips, and earn per 1,000 views.</li>
          <li>ClipTwo manages review, payout processing, and campaign analytics.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">3. Account Eligibility</h2>
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction) to use ClipTwo. You must provide accurate registration
          information and keep your account credentials secure.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">4. Your Content</h2>
        <p>
          Creators retain ownership of their original content. By posting a
          campaign, creators grant clippers a limited, non-exclusive license to
          create short-form clips from the source material solely for the
          purpose of that campaign.
        </p>
        <p>
          Clippers retain ownership of their original creative edits. By
          submitting a clip, clippers grant the campaign creator and ClipTwo a
          license to display, distribute, and promote the clip in connection
          with the campaign.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">5. Payments</h2>
        <p>
          Clippers earn money when their clips receive views. Earnings
          are calculated at the campaign&apos;s CPM rate. A platform fee is
          deducted from gross earnings before payout. See the{" "}
          <a href="/payout-policy" className="text-accent hover:underline">
            Payout Policy
          </a>{" "}
          for details.
        </p>
        <p>
          [PLACEHOLDER: Payment processor details, payout schedule, minimum
          thresholds, and tax obligations to be defined by legal/finance team.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">6. Prohibited Conduct</h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Manipulate views, engagement, or any platform metric.</li>
          <li>Submit content that infringes third-party intellectual property rights.</li>
          <li>Use the Platform for any unlawful purpose.</li>
          <li>Harass, abuse, or harm other users.</li>
          <li>Circumvent platform fees or payout mechanisms.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">7. Termination</h2>
        <p>
          ClipTwo may suspend or terminate accounts that violate these Terms.
          You may also close your account at any time, subject to outstanding
          obligations (pending payouts, active campaigns, etc.).
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">8. Limitation of Liability</h2>
        <p>
          [PLACEHOLDER: Standard limitation of liability language to be reviewed
          by legal counsel before publication.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">9. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated via email or in-app notification. Continued use of the
          Platform after changes take effect constitutes acceptance.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">10. Contact</h2>
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:support@cliptwo.com" className="text-accent hover:underline">
            support@cliptwo.com
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
