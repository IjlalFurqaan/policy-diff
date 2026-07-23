import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CompanyLogo } from "@/components/company-logo";
import { DiffView, DiffViewSkeleton } from "@/components/diff-view";
import { SeverityBadge } from "@/components/severity";
import { TagList } from "@/components/tag-list";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime, formatPercent } from "@/lib/format";
import { getChange, getChangeDiff, getChangeIds } from "@/lib/queries";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  const ids = await getChangeIds();
  return ids.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const change = await getChange(id);
  if (!change) return { title: "Change not found" };

  const documentLabel =
    change.documentType === "tos" ? "Terms of Service" : "Privacy Policy";
  const title = `${change.companyName}: ${change.headline}`;

  return {
    title,
    description: change.summary || `A change to ${change.companyName}'s ${documentLabel}.`,
    alternates: { canonical: `/change/${id}` },
    openGraph: {
      title,
      description: change.summary,
      type: "article",
      publishedTime: change.detectedAt.toISOString(),
    },
  };
}

export default function ChangePage({ params }: PageProps) {
  return (
    <Suspense fallback={<ChangeSkeleton />}>
      <ChangeDetail params={params} />
    </Suspense>
  );
}

async function ChangeDetail({ params }: PageProps) {
  const { id } = await params;
  const change = await getChange(id);
  if (!change) notFound();

  const documentLabel =
    change.documentType === "tos" ? "Terms of Service" : "Privacy Policy";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Above the fold: everything a reader needs without scrolling. The diff
          below streams in separately. */}
      <article className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <CompanyLogo name={change.companyName} logoUrl={change.companyLogoUrl} size={24} />
          <Link
            href={`/company/${change.companySlug}`}
            className="font-medium text-foreground hover:underline"
          >
            {change.companyName}
          </Link>
          <span aria-hidden>·</span>
          <span>{documentLabel}</span>
          <span aria-hidden>·</span>
          <time dateTime={change.detectedAt.toISOString()}>
            {formatDate(change.detectedAt)}
          </time>
        </div>

        <h1 className="text-3xl font-semibold leading-tight tracking-tight">{change.headline}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={change.severity} />
          <TagList tags={change.tags} />
        </div>

        {change.summary ? (
          <p className="mt-5 text-base leading-relaxed">{change.summary}</p>
        ) : null}

        {change.userImpact ? (
          <Card className="mt-5 border-l-4 border-l-foreground/30 p-5">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What this means for you
            </h2>
            <p className="leading-relaxed">{change.userImpact}</p>
          </Card>
        ) : null}

        {change.confidence === "low" ? (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
            The legal effect of this change is ambiguous from the diff alone. Read the source
            document before relying on this summary.
          </p>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-4">
          <Stat label="Words changed" value={formatPercent(change.changeRatio)} />
          <Stat label="Severity" value={`${change.severity} of 5`} />
          <Stat label="Previous version" value={formatDate(change.fromFetchedAt)} />
          <Stat label="This version" value={formatDate(change.toFetchedAt)} />
        </dl>

        <p className="mt-4 text-sm">
          <a
            href={change.sourceUrl}
            rel="nofollow noopener"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Read the current document at {change.companyName} ↗
          </a>
        </p>
      </article>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">The diff</h2>
        <Suspense fallback={<DiffViewSkeleton />}>
          <DiffSection
            id={id}
            oldLabel={`Captured ${formatDateTime(change.fromFetchedAt)}`}
            newLabel={`Captured ${formatDateTime(change.toFetchedAt)}`}
          />
        </Suspense>
      </section>
    </div>
  );
}

async function DiffSection({
  id,
  oldLabel,
  newLabel,
}: {
  id: string;
  oldLabel: string;
  newLabel: string;
}) {
  const diff = await getChangeDiff(id);
  if (!diff) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
        The stored diff for this change could not be loaded.
      </p>
    );
  }
  return <DiffView diff={diff} oldLabel={oldLabel} newLabel={newLabel} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function ChangeSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="mt-10">
        <DiffViewSkeleton />
      </div>
    </div>
  );
}
