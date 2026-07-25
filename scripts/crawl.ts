import "./_env";

import { closeDb } from "@/db";
import { runCrawl } from "@/lib/crawler/pipeline";

/**
 * Runs one crawl from the command line.
 *
 * Note this does NOT invalidate cached pages — `revalidateTag` only exists
 * inside a Next request. Use the cron route (`npm run e2e`, or curl it) when
 * the pages need to update.
 */
async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const report = await runCrawl({ limit });

  console.log(`considered ${report.considered} document(s) in ${report.durationMs}ms\n`);
  for (const outcome of report.outcomes) {
    const detail = outcome.detail ? ` — ${outcome.detail}` : "";
    console.log(
      `  ${outcome.status.padEnd(16)} ${outcome.companyName} ${outcome.type}${detail}`,
    );
  }
  if (report.revalidate.length > 0) {
    console.log(`\nwould revalidate: ${report.revalidate.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
