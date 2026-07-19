import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export * as schema from "./schema";

/**
 * Both drivers expose the same query-builder surface; only the transport and
 * the result-type marker differ, and this app never touches either. Typing
 * against one of them keeps every call site free of driver unions.
 */
export type Db = PostgresJsDatabase<typeof schema>;

function resolveDriver(url: string): "neon" | "postgres" {
  const configured = process.env.DB_DRIVER;
  if (configured === "neon" || configured === "postgres") return configured;
  // Neon's HTTP driver only speaks to Neon. Anything else — including the
  // PGlite server behind `npm run db:local` — gets the TCP driver.
  return /\.neon\.tech(:|\/|$)/.test(new URL(url).host) ? "neon" : "postgres";
}

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local, or run `npm run db:local` for an embedded Postgres.",
    );
  }

  if (resolveDriver(url) === "neon") {
    return drizzleNeon(neon(url), {
      schema,
      casing: "snake_case",
    }) as unknown as Db;
  }

  return drizzlePg(
    postgres(url, {
      // Serverless functions are short-lived and Neon is the production
      // target; a small pool is plenty for local work and CLI scripts.
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    }),
    { schema, casing: "snake_case" },
  );
}

// Next dev recompiles modules on every edit; without this each recompile would
// open another pool against the local server.
const globalForDb = globalThis as unknown as { __policyDiffDb?: Db };

export const db: Db = globalForDb.__policyDiffDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__policyDiffDb = db;
}
