import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Community Guidelines — ClipTwo",
};

export default function CommunityGuidelinesPage() {
  return (
    <PolicyPage title="Community Guidelines" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Our Values</h2>
        <p>
          ClipTwo is a community of creators and clippers working together to
          make great short-form content. We value:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Respect</strong> — treat every user with dignity.</li>
          <li><strong>Integrity</strong> — be honest in your work and dealings.</li>
          <li><strong>Fairness</strong> — follow the rules and honor commitments.</li>
          <li><strong>Creativity</strong> — bring your best ideas to every clip.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How Clipping Works on ClipTwo</h2>
        <p>
          ClipTwo connects two groups:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Creators</strong> post campaigns with source material, a brief, and a budget.</li>
          <li><strong>Clippers</strong> watch the source material and create short-form clips that match the brief.</li>
          <li>Approved clips earn money based on views at the campaign&apos;s CPM rate.</li>
        </ul>
        <p className="mt-2">
          Every user agrees to follow these guidelines when using the platform.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Be Respectful</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>No harassment, hate speech, or personal attacks.</li>
          <li>No discriminatory language or content.</li>
          <li>No spam, phishing, or scam attempts.</li>
          <li>Communicate professionally with other users.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Be Honest</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Do not misrepresent your identity or qualifications.</li>
          <li>Do not fabricate views, engagement, or credentials.</li>
          <li>Do not make false claims about other users.</li>
          <li>Disclose any conflicts of interest.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Be Fair</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Honor campaign commitments (brief, budget, timeline).</li>
          <li>Review clips promptly and provide constructive feedback.</li>
          <li>Do not reject clips without valid reason.</li>
          <li>Do not exploit platform loopholes or game the system.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Protect Others</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Respect other users&apos; privacy and personal information.</li>
          <li>Do not share or redistribute source material outside campaigns.</li>
          <li>Report policy violations promptly.</li>
          <li>Do not encourage or assist others in breaking the rules.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What Happens When Rules Are Broken</h2>
        <p>
          Violations are taken seriously. Depending on severity:
        </p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li><strong>Warning</strong> — for minor first-time violations.</li>
          <li><strong>Temporary suspension</strong> — for repeated or moderate violations.</li>
          <li><strong>Permanent ban</strong> — for severe violations (fraud, hate speech, illegal content).</li>
          <li><strong>Forfeiture of earnings</strong> — for fraudulent activity.</li>
        </ol>
        <p className="mt-2">
          [PLACEHOLDER: Specific violation categories and corresponding
          penalties to be defined by trust &amp; safety team.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Appeals</h2>
        <p>
          If you believe a moderation action was taken in error, you may appeal
          by contacting{" "}
          <a href="mailto:trust@cliptwo.com" className="text-accent hover:underline">
            trust@cliptwo.com
          </a>{" "}
          with:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Your account email.</li>
          <li>The action you&apos;re appealing.</li>
          <li>Why you believe it was a mistake.</li>
          <li>Any supporting evidence.</li>
        </ul>
        <p className="mt-2">
          Appeals are reviewed within 5 business days. Our decision is final
          except where required by applicable law.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Reporting</h2>
        <p>
          To report a violation, email{" "}
          <a href="mailto:trust@cliptwo.com" className="text-accent hover:underline">
            trust@cliptwo.com
          </a>{" "}
          with a description of the issue. All reports are confidential.
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
