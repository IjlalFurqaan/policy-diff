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

/**
 * Held so CLI scripts can close the pool and let the process end on its own.
 * Nothing in the app touches it — serverless functions are torn down for us.
 */
let openClient: ReturnType<typeof postgres> | null = null;

export async function closeDb(): Promise<void> {
  await openClient?.end({ timeout: 5 });
  openClient = null;
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

  openClient = postgres(url, {
    // Small and long-lived on purpose. Production is Neon over HTTP, so this
    // driver is only ever pointed at a local server — in practice the embedded
    // PGlite bridge, which executes one query at a time and gets unhappy when
    // a pool opens and recycles connections underneath it. One stable
    // connection avoids that entirely and costs nothing, since PGlite would
    // serialise the queries regardless. Raise DB_POOL_MAX for a real Postgres.
    max: Number(process.env.DB_POOL_MAX ?? 1),
    idle_timeout: 0,
    connect_timeout: 10,
  });

  return drizzlePg(openClient, { schema, casing: "snake_case" });
}

// Next dev recompiles modules on every edit; without this each recompile would
// open another pool against the local server.
const globalForDb = globalThis as unknown as { __policyDiffDb?: Db };

export const db: Db = globalForDb.__policyDiffDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__policyDiffDb = db;
}
