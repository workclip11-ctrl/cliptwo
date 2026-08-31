import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Clipper Rules — ClipTwo",
};

export default function ClipperRulesPage() {
  return (
    <PolicyPage title="Clipper Rules" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p>
          Clippers are the creative backbone of ClipTwo. You take long-form
          videos from creators and turn them into engaging short-form clips.
          This page explains what you can and cannot do, and how the platform
          works from a clipper&apos;s perspective.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">How Clipping Works</h2>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Browse open campaigns on the marketplace.</li>
          <li>Read the campaign brief, rules, and source material links.</li>
          <li>Create a short-form clip (15–60 seconds) following the brief.</li>
          <li>Submit your clip with a caption and the platform where you&apos;ll post it.</li>
          <li>Wait for review (admin approves/rejects).</li>
          <li>Once approved, post the clip on your social account.</li>
          <li>Views are counted from your linked post and you earn per 1,000 views.</li>
        </ol>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What You Must Do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Follow the campaign brief exactly (hook, duration, CTA, etc.).</li>
          <li>Post clips on the platform you specified during submission.</li>
          <li>Use the correct hashtags, tags, and captions as instructed.</li>
          <li>Wait for approval before posting (unless the campaign allows early posting).</li>
          <li>Report any issues with source material promptly.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What You Must NOT Do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Never fabricate views.</strong> Using bots, view farms, or any artificial means to inflate views will result in permanent ban and forfeiture of all earnings.</li>
          <li><strong>Never reuse clips</strong> across multiple campaigns without explicit permission.</li>
          <li><strong>Never claim ownership</strong> of the original source material.</li>
          <li><strong>Never post clips before approval</strong> unless the campaign explicitly allows it.</li>
          <li><strong>Never manipulate engagement</strong> (likes, comments, shares) through artificial means.</li>
          <li><strong>Never share campaign source material</strong> with third parties.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Rejection Reasons</h2>
        <p>Your clip may be rejected if:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>It does not follow the campaign brief.</li>
          <li>It is too long or too short.</li>
          <li>It contains copyrighted music or content not provided in source assets.</li>
          <li>It has poor video or audio quality.</li>
          <li>It is a duplicate of a previously submitted clip.</li>
          <li>The caption or hashtags are incorrect.</li>
          <li>It violates the Content Policy.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Account Standing</h2>
        <p>
          Your clipper account has a reputation score based on approval rate,
          clip quality, and consistency. Higher reputation unlocks:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Priority access to new campaigns.</li>
          <li>Higher budget campaigns.</li>
          <li>Verified Clipper badge.</li>
        </ul>
        <p>
          Accounts with low approval rates or policy violations may be suspended
          or permanently banned.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Fraud Policy</h2>
        <p>
          ClipTwo uses automated and manual systems to detect fraudulent
          activity. If fraud is detected:
        </p>
        <ol className="list-decimal pl-5 mt-2 space-y-1">
          <li>All pending earnings for the affected clips are frozen.</li>
          <li>The clips may be removed from circulation.</li>
          <li>Your account is reviewed by the trust &amp; safety team.</li>
          <li>Confirmed fraud results in permanent ban and forfeiture of all earnings.</li>
          <li>[PLACEHOLDER: Legal action for severe or repeated fraud to be determined.]</li>
        </ol>
        <p>Examples of fraud include but are not limited to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Using bots or automated tools to generate views.</li>
          <li>Click/view farms or paid view services.</li>
          <li>Self-viewing through multiple accounts.</li>
          <li>Coordinated inauthentic behavior.</li>
        </ul>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
