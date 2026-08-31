import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Privacy Policy — ClipTwo",
};

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">1. What We Collect</h2>
        <p>We collect information you provide directly:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Account info:</strong> name, email, profile details.</li>
          <li><strong>Payment info:</strong> UPI ID or payment handle for payouts.</li>
          <li><strong>Content:</strong> clips, captions, video URLs you submit.</li>
          <li><strong>Connected accounts:</strong> social platform handles (Instagram, YouTube) for verification.</li>
        </ul>
        <p className="mt-2">
          We also collect usage data automatically: browser type, pages visited,
          timestamps, and device identifiers.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">2. How We Use Your Data</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To operate the Platform (match clippers with campaigns, process payouts).</li>
          <li>To verify views and prevent fraud.</li>
          <li>To communicate with you about your account, campaigns, and updates.</li>
          <li>To improve the Platform and user experience.</li>
          <li>To comply with legal obligations.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">3. Data Sharing</h2>
        <p>
          We do not sell your personal data. We may share information with:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Payment processors</strong> to handle payouts.</li>
          <li><strong>Analytics providers</strong> to understand platform usage (anonymized where possible).</li>
          <li><strong>Legal authorities</strong> when required by law or to protect rights.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">4. Data Security</h2>
        <p>
          We implement industry-standard security measures to protect your data.
          However, no method of transmission over the Internet is 100% secure.
          [PLACEHOLDER: Specific security measures to be detailed by engineering.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">5. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active or as needed
          to provide the Platform. [PLACEHOLDER: Specific retention periods to
          be defined by legal team.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">6. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have the right to:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>Object to or restrict processing of your data.</li>
          <li>Data portability.</li>
        </ul>
        <p className="mt-2">
          To exercise these rights, contact{" "}
          <a href="mailto:support@cliptwo.com" className="text-accent hover:underline">
            support@cliptwo.com
          </a>
          .
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">7. Cookies</h2>
        <p>
          [PLACEHOLDER: Cookie policy details to be added. We plan to use
          essential cookies for authentication and optional analytics cookies
          with user consent.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">8. Children&apos;s Privacy</h2>
        <p>
          ClipTwo is not intended for users under 18. We do not knowingly
          collect data from children.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">9. Changes to This Policy</h2>
        <p>
          We may update this policy. Material changes will be communicated via
          email or in-app notification. The &quot;Last updated&quot; date at the
          top reflects when changes were last made.
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
