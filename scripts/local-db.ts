/**
 * Local Postgres for development.
 *
 * Production runs on Neon. There is no Postgres on a typical dev machine and
 * this project needs a real one (JSONB, arrays, generated defaults), so we run
 * PGlite — Postgres compiled to WASM — and expose it on the real wire protocol.
 * The app, the migrator and the crawler scripts all connect to it over TCP the
 * same way they would connect to Neon.
 *
 *   npm run db:local        # leave running in its own terminal
 *
 * Data lives in .pgdata/ and survives restarts. Delete it to start clean.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = path.resolve(process.cwd(), ".pgdata");
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const HOST = "127.0.0.1";

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({
    db,
    port: PORT,
    host: HOST,
    // The dev server, the crawler and psql-style one-offs all want a
    // connection at the same time; PGlite serialises the queries anyway.
    maxConnections: 20,
  });

  await server.start();
  console.log(`local postgres listening on postgresql://postgres:postgres@${HOST}:${PORT}/postgres`);
  console.log(`data directory: ${DATA_DIR}`);

  const shutdown = async () => {
    console.log("\nshutting down local postgres");
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
