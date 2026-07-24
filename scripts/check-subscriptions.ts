import "./_env";

import { eq } from "drizzle-orm";

import { closeDb, db } from "@/db";
import { companies, subscriptions } from "@/db/schema";

/** Lists who is subscribed to what. There is no admin UI, so this is it. */
async function main() {
  const rows = await db
    .select({
      email: subscriptions.email,
      company: companies.name,
      token: subscriptions.unsubscribeToken,
      unsubscribedAt: subscriptions.unsubscribedAt,
      createdAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(companies, eq(subscriptions.companyId, companies.id))
    .orderBy(subscriptions.createdAt);

  if (rows.length === 0) {
    console.log("no subscriptions");
    return;
  }

  for (const row of rows) {
    const state = row.unsubscribedAt
      ? `unsubscribed ${row.unsubscribedAt.toISOString()}`
      : "active";
    console.log(`${row.email}  ->  ${row.company}  [${state}]  token=${row.token}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
