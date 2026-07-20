import { fetchRobotsTxt, isAllowed } from "./robots";
import { userAgent } from "./user-agent";

export const MAX_BYTES = 4 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 25_000;

export type FetchSkipReason =
  | "robots-disallowed"
  | "domain-already-fetched"
  | "blocked-host";

export type FetchOutcome =
  | { ok: true; html: string; finalUrl: string; status: number }
  | { ok: false; skipped: true; reason: FetchSkipReason; message: string }
  | { ok: false; skipped: false; reason: "error"; message: string; status?: number };

/**
 * Tracks which hosts have already been contacted, enforcing the one-request
 * -per-domain-per-run rule. A document whose host is taken is left untouched —
 * its lastCheckedAt is not bumped, so it sorts to the front of the next run.
 */
export class DomainGate {
  private readonly seen = new Set<string>();

  claim(host: string): boolean {
    const key = host.toLowerCase();
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Fetching a private address from a server that accepts URLs is how SSRF
 * happens. Policy URLs are public documents, so the loopback exception exists
 * only for the local fixture and has to be switched on deliberately.
 */
function hostAllowed(url: URL): { allowed: boolean; message?: string } {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, message: `unsupported protocol ${url.protocol}` };
  }
  if (isLocalHost(url.hostname)) {
    if (process.env.CRAWL_ALLOW_LOCALHOST === "true") return { allowed: true };
    return { allowed: false, message: "localhost is not crawlable (set CRAWL_ALLOW_LOCALHOST)" };
  }
  if (/^(10|127|0)\./.test(url.hostname) || /^192\.168\./.test(url.hostname)) {
    return { allowed: false, message: "private address" };
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) {
    return { allowed: false, message: "private address" };
  }
  return { allowed: true };
}

/**
 * One polite fetch: host allowed, robots respected, one domain per run, capped
 * body size, capped time. robots.txt itself is exempt from the domain gate —
 * it is the request that makes the other one legitimate.
 */
export async function fetchDocument(
  sourceUrl: string,
  gate: DomainGate,
  options: { skipRobots?: boolean } = {},
): Promise<FetchOutcome> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return { ok: false, skipped: false, reason: "error", message: `invalid URL ${sourceUrl}` };
  }

  const host = hostAllowed(url);
  if (!host.allowed) {
    return {
      ok: false,
      skipped: true,
      reason: "blocked-host",
      message: host.message ?? "host not allowed",
    };
  }

  if (!gate.claim(url.host)) {
    return {
      ok: false,
      skipped: true,
      reason: "domain-already-fetched",
      message: `${url.host} was already contacted this run`,
    };
  }

  if (!options.skipRobots) {
    const robots = await fetchRobotsTxt(url.origin);
    if (robots.unavailable) {
      return {
        ok: false,
        skipped: true,
        reason: "robots-disallowed",
        message: "robots.txt could not be read",
      };
    }
    if (!isAllowed(robots, url.toString())) {
      return {
        ok: false,
        skipped: true,
        reason: "robots-disallowed",
        message: `robots.txt disallows ${url.pathname}`,
      };
    }
    if (robots.crawlDelaySeconds) {
      await sleep(Math.min(robots.crawlDelaySeconds, 10) * 1000);
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": userAgent(),
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        reason: "error",
        status: response.status,
        message: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      return {
        ok: false,
        skipped: false,
        reason: "error",
        message: `unsupported content-type ${contentType}`,
      };
    }

    const html = await readCapped(response, MAX_BYTES);
    return { ok: true, html, finalUrl: response.url || url.toString(), status: response.status };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readCapped(response: Response, limit: number): Promise<string> {
  const body = response.body;
  if (!body) return response.text();

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit) {
        text += decoder.decode(value.slice(0, value.byteLength - (received - limit)));
        throw new SizeLimitReached();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (!(error instanceof SizeLimitReached)) throw error;
  } finally {
    await reader.cancel().catch(() => {});
  }

  return text;
}

class SizeLimitReached extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
