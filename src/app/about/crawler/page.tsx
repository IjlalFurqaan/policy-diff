import type { Metadata } from "next";

import { CRAWLER_NAME, CRAWLER_VERSION } from "@/lib/crawler/user-agent";

export const metadata: Metadata = {
  title: "About the crawler",
  description:
    "How PolicyDiffBot fetches public terms of service and privacy policies, and how to block it.",
};

/**
 * The page the crawler's User-Agent points at. A site operator who sees
 * PolicyDiffBot in their logs should land somewhere that explains itself.
 */
export default function CrawlerPage() {
  const contact = process.env.CRAWLER_CONTACT_URL || "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">About {CRAWLER_NAME}</h1>

      <div className="mt-6 space-y-5 text-sm leading-relaxed">
        <p>
          Policy Diff fetches the public terms of service and privacy policy pages of a fixed list
          of well-known consumer services, compares each one against the previous version, and
          publishes a plain-language description of what changed.
        </p>

        <div className="rounded-lg border border-border bg-card p-4 font-mono text-xs">
          {CRAWLER_NAME}/{CRAWLER_VERSION} (+{contact || "contact URL not configured"})
        </div>

        <h2 className="pt-2 text-base font-semibold">What it does</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Requests <code className="font-mono">/robots.txt</code> before any page, and honours it.</li>
          <li>Makes at most one page request per domain per run, and runs every six hours.</li>
          <li>Fetches at most ten documents per run across all companies.</li>
          <li>Requests only the two URLs listed for each company — it does not spider links.</li>
          <li>Ignores anything behind a login, and does not execute JavaScript.</li>
          <li>Skips a document entirely if robots.txt cannot be read.</li>
        </ul>

        <h2 className="pt-2 text-base font-semibold">Blocking it</h2>
        <p className="text-muted-foreground">
          Add the following to your <code className="font-mono">robots.txt</code> and the next run
          will stop fetching:
        </p>
        <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-xs">
          {`User-agent: ${CRAWLER_NAME}\nDisallow: /`}
        </pre>

        <h2 className="pt-2 text-base font-semibold">Corrections</h2>
        <p className="text-muted-foreground">
          Summaries are generated from the diff between two captured versions and can be wrong. The
          source URL is linked on every change page, and the full before/after text is shown so any
          summary can be checked against what the document actually says.
        </p>
      </div>
    </div>
  );
}
