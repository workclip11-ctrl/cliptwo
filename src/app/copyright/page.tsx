import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Copyright & Takedown Policy — ClipTwo",
};

export default function CopyrightPage() {
  return (
    <PolicyPage title="Copyright & Takedown Policy" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p>
          ClipTwo respects the intellectual property rights of others. We expect
          our users to do the same. This policy explains how copyright
          infringement is handled on the platform.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How Clipping &amp; Copyright Works</h2>
        <p>
          When a creator posts a campaign, they grant clippers a limited license
          to create short-form clips from the provided source material. This
          license:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Is limited to the specific campaign.</li>
          <li>Does not transfer ownership of the source material.</li>
          <li>Does not extend to content outside the campaign.</li>
          <li>Ends when the campaign ends or is cancelled.</li>
        </ul>
        <p className="mt-2">
          Clippers must only use source material provided by the campaign creator.
          Using third-party content without permission is a copyright violation.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Your Responsibilities</h2>
        <p><strong>Creators:</strong></p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>You must own or have rights to all source material you upload.</li>
          <li>You must have the authority to grant clipping rights.</li>
          <li>You must not upload content that infringes third-party rights.</li>
        </ul>
        <p className="mt-2"><strong>Clippers:</strong></p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>You must only use source material from the campaign you&apos;re working on.</li>
          <li>You must not add copyrighted music, footage, or images without permission.</li>
          <li>You must not repurpose clips across campaigns without authorization.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">DMCA / Takedown Requests</h2>
        <p>
          If you believe your copyrighted work has been used on ClipTwo without
          authorization, please send a takedown request to{" "}
          <a href="mailto:copyright@cliptwo.com" className="text-accent hover:underline">
            copyright@cliptwo.com
          </a>{" "}
          with:
        </p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>A description of the copyrighted work.</li>
          <li>The URL of the infringing content on ClipTwo.</li>
          <li>Proof of ownership (copyright registration, license, etc.).</li>
          <li>Your contact information.</li>
          <li>A statement of good-faith belief that the use is not authorized.</li>
          <li>A statement under penalty of perjury that the information is accurate.</li>
        </ol>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Our Response</h2>
        <p>Upon receiving a valid takedown request:</p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>We will remove or disable access to the infringing content.</li>
          <li>We will notify the user who posted the content.</li>
          <li>The user may submit a counter-notification if they believe the takedown was in error.</li>
          <li>[PLACEHOLDER: Specific response timelines to be defined.]</li>
        </ol>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Repeat Infringers</h2>
        <p>
          Users who repeatedly infringe copyrights may have their accounts
          permanently terminated. [PLACEHOLDER: Specific strike policy to be
          defined — e.g., 3 strikes = permanent ban.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Counter-Notification</h2>
        <p>
          If your content was removed and you believe it was a mistake, you may
          submit a counter-notification with:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Identification of the removed content.</li>
          <li>A statement under penalty of perjury that the removal was a mistake.</li>
          <li>Your consent to jurisdiction and contact information.</li>
        </ul>
        <p>
          [PLACEHOLDER: Counter-notification process and timelines to be
          defined.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Good-Faith Belief</h2>
        <p>
          Filing false takedown requests or counter-notifications may result in
          legal liability. [PLACEHOLDER: Specific legal consequences to be
          reviewed by legal counsel.]
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
