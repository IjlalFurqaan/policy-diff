import "./_env";

import { desc, eq } from "drizzle-orm";

import { closeDb, db } from "@/db";
import { changes, companies, documents } from "@/db/schema";

/**
 * Prints what the crawler recorded for one company, including the hunks it
 * diffed. The quickest way to see why a change was classified the way it was.
 *
 *   npm run inspect -- spotify
 */
async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("usage: npm run inspect -- <company-slug>");

  const rows = await db
    .select({
      id: changes.id,
      detectedAt: changes.detectedAt,
      ratio: changes.changeRatio,
      cosmetic: changes.cosmetic,
      needsReview: changes.needsReview,
      published: changes.published,
      confidence: changes.confidence,
      headline: changes.headline,
      diffJson: changes.diffJson,
      type: documents.type,
    })
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(eq(companies.slug, slug))
    .orderBy(desc(changes.detectedAt));

  if (rows.length === 0) {
    console.log(`no changes recorded for ${slug}`);
    return;
  }

  for (const row of rows) {
    const state = row.cosmetic
      ? "cosmetic"
      : row.published
        ? "published"
        : "held for review";

    console.log(
      `\n${row.detectedAt.toISOString()}  ${row.type}  ${state}` +
        `  ratio=${(row.ratio * 100).toFixed(3)}%  confidence=${row.confidence ?? "-"}`,
    );
    if (row.headline) console.log(`  ${row.headline}`);
    console.log(`  ${row.diffJson.hunks.length} hunk(s), id=${row.id}`);

    for (const hunk of row.diffJson.hunks.slice(0, 8)) {
      if (hunk.removed) console.log(`    - ${JSON.stringify(hunk.removed)}`);
      if (hunk.added) console.log(`    + ${JSON.stringify(hunk.added)}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
