import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PolicyPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to ClipTwo
        </Link>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {lastUpdated}</p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/80">
          {children}
        </div>

        <div className="mt-12 rounded-xl border bg-card p-6">
          <p className="text-sm text-muted">
            <strong className="text-foreground">Disclaimer:</strong> This page
            provides a general overview of ClipTwo&apos;s policies. It is not
            legal advice. For questions about your specific situation, contact{" "}
            <a
              href="mailto:support@cliptwo.com"
              className="text-accent hover:underline"
            >
              support@cliptwo.com
            </a>
            .
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm text-muted">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/payout-policy" className="hover:text-foreground transition-colors">
            Payout Policy
          </Link>
          <Link href="/clipper-rules" className="hover:text-foreground transition-colors">
            Clipper Rules
          </Link>
          <Link href="/creator-rules" className="hover:text-foreground transition-colors">
            Creator Rules
          </Link>
          <Link href="/content-policy" className="hover:text-foreground transition-colors">
            Content Policy
          </Link>
          <Link href="/copyright" className="hover:text-foreground transition-colors">
            Copyright
          </Link>
          <Link href="/refund-policy" className="hover:text-foreground transition-colors">
            Refund Policy
          </Link>
          <Link
            href="/community-guidelines"
            className="hover:text-foreground transition-colors"
          >
            Community Guidelines
          </Link>
        </div>
      </div>
    </main>
  );
}
