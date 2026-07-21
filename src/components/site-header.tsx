import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Policy Diff</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            what changed in the terms you agreed to
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/companies" className="text-muted-foreground hover:text-foreground">
            Companies
          </Link>
          <Link href="/about/crawler" className="text-muted-foreground hover:text-foreground">
            Crawler
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">
        <p>
          Policy Diff tracks public terms of service and privacy policies and describes what
          changed between two versions. It is not legal advice, and the summaries are generated —
          always read the source document before relying on it.
        </p>
      </div>
    </footer>
  );
}
