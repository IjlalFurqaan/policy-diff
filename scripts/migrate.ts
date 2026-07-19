import "./_env";

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { migrate as migrateNeon } from "drizzle-orm/neon-http/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATIONS_FOLDER = "./drizzle";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const isNeon =
    process.env.DB_DRIVER === "neon" ||
    (process.env.DB_DRIVER !== "postgres" && /\.neon\.tech(:|\/|$)/.test(new URL(url).host));

  if (isNeon) {
    await migrateNeon(drizzleNeon(neon(url)), { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    const client = postgres(url, { max: 1 });
    await migratePg(drizzlePg(client), { migrationsFolder: MIGRATIONS_FOLDER });
    await client.end();
  }

  console.log("migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
