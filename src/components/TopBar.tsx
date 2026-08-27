import Link from "next/link";

export function TopBar({
  active,
}: {
  active?: "home" | "clipper" | "creator" | "campaigns";
}) {
  const base =
    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";
  return (
    <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs text-white">
            C
          </span>
          cliptwo
        </Link>
        <nav className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Link
            href="/clipper"
            className={`${base} ${
              active === "clipper"
                ? "bg-accent-soft text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            Clipper
          </Link>
          <Link
            href="/creator"
            className={`${base} ${
              active === "creator"
                ? "bg-accent-soft text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            Creator
          </Link>
        </nav>
        <Link
          href="/login"
          className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent-soft"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}
