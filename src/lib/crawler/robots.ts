import { ROBOTS_TOKEN, userAgent } from "./user-agent";

export interface RobotsRule {
  allow: boolean;
  /** The raw path pattern, which may contain `*` and a trailing `$`. */
  pattern: string;
}

export interface RobotsTxt {
  rules: RobotsRule[];
  crawlDelaySeconds: number | null;
  /** Set when robots.txt could not be read and we chose to stay out. */
  unavailable: boolean;
}

export const ALLOW_ALL: RobotsTxt = { rules: [], crawlDelaySeconds: null, unavailable: false };
export const DISALLOW_ALL: RobotsTxt = {
  rules: [{ allow: false, pattern: "/" }],
  crawlDelaySeconds: null,
  unavailable: true,
};

/**
 * Parses robots.txt, keeping only the group that applies to us: an exact
 * user-agent match if the file names us, otherwise the `*` group. Groups may
 * list several user-agents before their rules, which is why agents are
 * collected until the first non-`User-agent` line.
 */
export function parseRobotsTxt(body: string): RobotsTxt {
  const specific: RobotsRule[] = [];
  const wildcard: RobotsRule[] = [];
  let specificDelay: number | null = null;
  let wildcardDelay: number | null = null;

  let agents: string[] = [];
  let collectingAgents = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!collectingAgents) {
        agents = [];
        collectingAgents = true;
      }
      agents.push(value.toLowerCase());
      continue;
    }

    collectingAgents = false;
    if (agents.length === 0) continue;

    const appliesToUs = agents.includes(ROBOTS_TOKEN);
    const appliesToAll = agents.includes("*");
    if (!appliesToUs && !appliesToAll) continue;

    if (field === "allow" || field === "disallow") {
      // An empty Disallow means "allow everything" and carries no pattern.
      if (field === "disallow" && value === "") continue;
      const rule: RobotsRule = { allow: field === "allow", pattern: value };
      if (appliesToUs) specific.push(rule);
      else wildcard.push(rule);
    } else if (field === "crawl-delay") {
      const delay = Number.parseFloat(value);
      if (Number.isFinite(delay) && delay >= 0) {
        if (appliesToUs) specificDelay = delay;
        else wildcardDelay = delay;
      }
    }
  }

  // A group naming us wins outright, even if it is more permissive.
  const named = specific.length > 0 || specificDelay !== null;
  return {
    rules: named ? specific : wildcard,
    crawlDelaySeconds: named ? specificDelay : wildcardDelay,
    unavailable: false,
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchoredEnd = pattern.endsWith("$");
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchoredEnd ? "$" : ""}`);
}

/**
 * Longest matching pattern wins; Allow wins a tie. This is the behaviour the
 * major crawlers converged on and what site operators expect.
 */
export function isAllowed(robots: RobotsTxt, url: string): boolean {
  const { pathname, search } = new URL(url);
  const path = `${pathname}${search}`;

  let best: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }

  return best ? best.allow : true;
}

const cache = new Map<string, Promise<RobotsTxt>>();

/**
 * Fetches and caches robots.txt per origin.
 *
 * A missing file (4xx) means no restrictions. A server error or a network
 * failure means we do not know, and not knowing is a reason to stay out —
 * the document simply waits for the next run.
 */
export async function fetchRobotsTxt(origin: string, timeoutMs = 10_000): Promise<RobotsTxt> {
  const cached = cache.get(origin);
  if (cached) return cached;

  const promise = (async (): Promise<RobotsTxt> => {
    try {
      const response = await fetch(new URL("/robots.txt", origin), {
        headers: { "user-agent": userAgent(), accept: "text/plain,*/*;q=0.8" },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });

      if (response.status >= 400 && response.status < 500) return ALLOW_ALL;
      if (!response.ok) return DISALLOW_ALL;

      return parseRobotsTxt(await response.text());
    } catch {
      return DISALLOW_ALL;
    }
  })();

  cache.set(origin, promise);
  return promise;
}

/** Drops the cache. Each cron invocation starts from a clean view. */
export function clearRobotsCache(): void {
  cache.clear();
}
