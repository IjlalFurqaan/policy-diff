import type { Metadata } from "next";
import Link from "next/link";

import { CompanyLogo } from "@/components/company-logo";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { getCompanies } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Companies",
  description: "Every company Policy Diff watches, and when each was last checked.",
};

export default async function CompaniesPage() {
  const companies = await getCompanies();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Watched companies</h1>
        <p className="text-sm text-muted-foreground">
          Two documents each — terms of service and privacy policy. The ten least recently checked
          documents are re-fetched every six hours.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {companies.map((company) => (
          <li key={company.slug}>
            <Card className="h-full transition-colors hover:border-foreground/20">
              <Link href={`/company/${company.slug}`} className="flex items-center gap-3 p-4">
                <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
                <div className="min-w-0">
                  <p className="font-medium">{company.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {company.publishedChanges === 0
                      ? "No changes yet"
                      : `${company.publishedChanges} change${company.publishedChanges === 1 ? "" : "s"}`}
                    {company.lastCheckedAt
                      ? ` · checked ${formatDate(company.lastCheckedAt)}`
                      : " · never checked"}
                  </p>
                </div>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
