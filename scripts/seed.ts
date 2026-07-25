import "./_env";

import { sql } from "drizzle-orm";

import { closeDb, db } from "@/db";
import { companies, documents } from "@/db/schema";
import { SEED_COMPANIES, logoUrlFor } from "@/db/seed-data";

/**
 * Idempotent: re-running refreshes names, logos and URLs without touching
 * lastCheckedAt, so a reseed never makes the crawler forget what it has seen.
 * The first crawl of each document therefore stores a baseline snapshot and no
 * change record.
 */
async function main() {
  for (const company of SEED_COMPANIES) {
    const logoUrl = logoUrlFor(company.domain);

    const [row] = await db
      .insert(companies)
      .values({
        slug: company.slug,
        name: company.name,
        logoUrl,
        tosUrl: company.tosUrl,
        privacyUrl: company.privacyUrl,
      })
      .onConflictDoUpdate({
        target: companies.slug,
        set: {
          name: company.name,
          logoUrl,
          tosUrl: company.tosUrl,
          privacyUrl: company.privacyUrl,
        },
      })
      .returning();

    await db
      .insert(documents)
      .values([
        { companyId: row.id, type: "tos", sourceUrl: company.tosUrl },
        { companyId: row.id, type: "privacy", sourceUrl: company.privacyUrl },
      ])
      .onConflictDoUpdate({
        target: [documents.companyId, documents.type],
        set: { sourceUrl: sql`excluded.source_url` },
      });
  }

  const [{ companyCount }] = await db
    .select({ companyCount: sql<number>`count(*)::int` })
    .from(companies);
  const [{ documentCount }] = await db
    .select({ documentCount: sql<number>`count(*)::int` })
    .from(documents);

  console.log(`seeded ${companyCount} companies, ${documentCount} documents`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
