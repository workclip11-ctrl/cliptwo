import { PolicyPage } from "@/components/PolicyPage";

export const metadata = {
  title: "Content Policy — ClipTwo",
};

export default function ContentPolicyPage() {
  return (
    <PolicyPage title="Content Policy" lastUpdated="[PLACEHOLDER: Date]">
      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Overview</h2>
        <p>
          ClipTwo is a platform for creating and distributing short-form video
          content. All content on the platform must comply with these rules.
          Violations may result in clip rejection, account suspension, or
          permanent ban.
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What Content Is Allowed</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Educational content (tutorials, how-tos, explainers).</li>
          <li>Entertainment content (comedy, storytelling, reactions).</li>
          <li>Product reviews and unboxings (with proper disclosure).</li>
          <li>News and commentary on public interest topics.</li>
          <li>Lifestyle, fitness, cooking, travel, and hobby content.</li>
          <li>Business and marketing content.</li>
          <li>Content that is original, creative, and adds value.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">What Content Is Prohibited</h2>
        <p>The following content is strictly prohibited:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><strong>Hate speech</strong> — content that promotes violence, discrimination, or hatred based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics.</li>
          <li><strong>Harassment or bullying</strong> — targeted attacks on individuals or groups.</li>
          <li><strong>Graphic violence</strong> — excessively violent or gory content.</li>
          <li><strong>Sexual content</strong> — explicit sexual material or nudity.</li>
          <li><strong>Child exploitation</strong> — any content that exploits minors.</li>
          <li><strong>Illegal activities</strong> — content promoting or depicting illegal acts.</li>
          <li><strong>Self-harm or suicide</strong> — content that promotes or glorifies self-harm.</li>
          <li><strong>Misinformation</strong> — demonstrably false claims about public health, elections, or emergencies.</li>
          <li><strong>Spam or scams</strong> — deceptive content designed to mislead or defraud.</li>
          <li><strong>Intellectual property infringement</strong> — content that violates copyright or trademark rights.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Content Standards</h2>
        <p>All content must:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Be original or properly licensed.</li>
          <li>Comply with applicable laws and regulations.</li>
          <li>Be appropriate for the target audience.</li>
          <li>Not misrepresent the source or context of the content.</li>
          <li>Include proper disclosures for sponsored or paid content.</li>
        </ul>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Enforcement</h2>
        <p>
          Content that violates these rules may be:
        </p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Rejected during the review process.</li>
          <li>Removed after publication.</li>
          <li>Flagged for admin review.</li>
        </ul>
        <p className="mt-2">
          Repeated violations may result in account suspension or permanent ban.
          [PLACEHOLDER: Specific escalation ladder to be defined.]
        </p>
      </Section>

      <Section>
        <h2 className="text-xl font-semibold tracking-tight">Reporting Content</h2>
        <p>
          If you encounter content that violates these rules, please report it
          to{" "}
          <a href="mailto:trust@cliptwo.com" className="text-accent hover:underline">
            trust@cliptwo.com
          </a>{" "}
          with a description of the violation and any supporting evidence.
        </p>
      </Section>
    </PolicyPage>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
