import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { FEED_TAG, companyTag } from "@/lib/cache";
import { DEFAULT_BATCH_SIZE, runCrawl } from "@/lib/crawler/pipeline";

// Route handlers default to the Node.js runtime, which is what jsdom and
// node:crypto need. The function timeout is set in vercel.json rather than a
// `maxDuration` export, which cacheComponents disallows.

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the plain header is
  // there so a manual curl does not have to fake a bearer token.
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    if (constantTimeEquals(authorization.slice(7), secret)) return true;
  }

  const header = request.headers.get("x-cron-secret");
  return header ? constantTimeEquals(header, secret) : false;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requested = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(requested) && requested > 0 && requested <= 50
      ? Math.floor(requested)
      : DEFAULT_BATCH_SIZE;

  try {
    const report = await runCrawl({ limit });

    // Only the affected company's timeline is rebuilt — plus the front-page
    // feed, which lists every company and would otherwise never catch up.
    for (const slug of report.revalidate) {
      revalidateTag(companyTag(slug), "max");
    }
    if (report.revalidate.length > 0) {
      revalidateTag(FEED_TAG, "max");
    }

    return NextResponse.json(report, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[cron/crawl] run failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "crawl failed" },
      { status: 500 },
    );
  }
}

/** Vercel Cron issues GET; POST is here for manual triggering. */
export const POST = GET;
