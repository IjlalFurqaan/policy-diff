import Link from "next/link";

import { CompanyLogo } from "@/components/company-logo";
import { SeverityBadge } from "@/components/severity";
import { TagList } from "@/components/tag-list";
import { Card } from "@/components/ui/card";
import type { FeedItem } from "@/lib/queries";
import { formatDate, formatPercent } from "@/lib/format";

export function ChangeCard({
  change,
  showCompany = true,
}: {
  change: FeedItem;
  showCompany?: boolean;
}) {
  const documentLabel = change.documentType === "tos" ? "Terms of Service" : "Privacy Policy";

  return (
    <Card className="transition-colors hover:border-foreground/20">
      <article className="flex gap-4 p-5">
        {showCompany ? (
          <CompanyLogo name={change.companyName} logoUrl={change.companyLogoUrl} />
        ) : null}

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {showCompany ? (
              <>
                <Link
                  href={`/company/${change.companySlug}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {change.companyName}
                </Link>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <span>{documentLabel}</span>
            <span aria-hidden>·</span>
            <time dateTime={change.detectedAt.toISOString()}>
              {formatDate(change.detectedAt)}
            </time>
            <span aria-hidden>·</span>
            <span title="Share of the document's words that changed">
              {formatPercent(change.changeRatio)} changed
            </span>
          </div>

          <h2 className="text-lg font-semibold leading-snug">
            <Link href={`/change/${change.id}`} className="hover:underline">
              {change.headline}
            </Link>
          </h2>

          {change.summary ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{change.summary}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <SeverityBadge severity={change.severity} />
            <TagList tags={change.tags} />
          </div>
        </div>
      </article>
    </Card>
  );
}
