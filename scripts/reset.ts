import "./_env";

import { sql } from "drizzle-orm";

import { closeDb, db } from "@/db";

/** Empties every table but leaves the schema in place. Development only. */
async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("refusing to truncate a production database");
  }

  await db.execute(
    sql`truncate table changes, snapshots, subscriptions, documents, companies restart identity cascade`,
  );
  console.log("all tables truncated");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(closeDb);
