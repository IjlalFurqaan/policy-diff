import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChangeCard } from "@/components/change-card";
import { CompanyLogo } from "@/components/company-logo";
import { SubscribeForm } from "@/components/subscribe-form";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatPercent, pluralize } from "@/lib/format";
import { getCompanySlugs, getCompanyTimeline } from "@/lib/queries";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Prerenders every watched company; new slugs are rendered on first request. */
export async function generateStaticParams() {
  const slugs = await getCompanySlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const timeline = await getCompanyTimeline(slug);
  if (!timeline) return { title: "Company not found" };

  return {
    title: timeline.company.name,
    description: `Every recorded change to ${timeline.company.name}'s terms of service and privacy policy, explained in plain language.`,
    alternates: { canonical: `/company/${slug}` },
  };
}

export default function CompanyPage({ params }: PageProps) {
  return (
    <Suspense fallback={<CompanySkeleton />}>
      <CompanyTimeline params={params} />
    </Suspense>
  );
}

async function CompanyTimeline({ params }: PageProps) {
  const { slug } = await params;
  const timeline = await getCompanyTimeline(slug);
  if (!timeline) notFound();

  const { company, changes, cosmetic } = timeline;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-start gap-4">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company.publishedChanges === 0
              ? "No changes recorded yet"
              : pluralize(company.publishedChanges, "recorded change")}
            {company.lastCheckedAt ? ` · last checked ${formatDate(company.lastCheckedAt)}` : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {company.tosUrl ? (
              <a
                href={company.tosUrl}
                rel="nofollow noopener"
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Terms of Service ↗
              </a>
            ) : null}
            {company.privacyUrl ? (
              <a
                href={company.privacyUrl}
                rel="nofollow noopener"
                className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Privacy Policy ↗
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <Card className="mb-8 p-5">
        <h2 className="mb-1 font-medium">Get told when this changes</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          No account, no digest, no marketing — one email per published change.
        </p>
        <SubscribeForm companySlug={company.slug} companyName={company.name} />
      </Card>

      <h2 className="mb-4 text-lg font-semibold">Timeline</h2>

      {changes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          Nothing yet. The first crawl of each document is stored as a baseline, so changes only
          appear once {company.name} edits a document after that.
        </p>
      ) : (
        <ol className="space-y-4">
          {changes.map((change) => (
            <li key={change.id}>
              <ChangeCard change={change} showCompany={false} />
            </li>
          ))}
        </ol>
      )}

      {cosmetic.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-semibold">Filtered as cosmetic</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            The document text changed, but the change was punctuation, a rotated date, or a
            reordering — nothing that alters what the document says. Recorded, not published.
          </p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {cosmetic.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <span className="text-muted-foreground">
                  {entry.documentType === "tos" ? "Terms of Service" : "Privacy Policy"} ·{" "}
                  {formatPercent(entry.changeRatio)} of words
                </span>
                <time
                  dateTime={entry.detectedAt.toISOString()}
                  className="text-muted-foreground tabular-nums"
                >
                  {formatDate(entry.detectedAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-sm">
        <Link href="/companies" className="underline underline-offset-4">
          ← All companies
        </Link>
      </p>
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-start gap-4">
        <Skeleton className="size-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="mb-8 h-40 w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </div>
  );
}
