import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const FIXTURE = path.join(process.cwd(), "fixtures", "fake-tos.html");

/**
 * A locally-hosted policy page for exercising the pipeline end to end.
 *
 * Served straight from disk on every request so the file can be edited and
 * re-crawled without restarting anything. Never exposed in production: the
 * crawler refuses loopback hosts unless CRAWL_ALLOW_LOCALHOST is set, and this
 * route follows the same switch.
 */
export async function GET() {
  if (process.env.CRAWL_ALLOW_LOCALHOST !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const html = await readFile(FIXTURE, "utf8");
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse("fixture missing", { status: 500 });
  }
}
