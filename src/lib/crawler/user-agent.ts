export const CRAWLER_NAME = "PolicyDiffBot";
export const CRAWLER_VERSION = "1.0";

const DEFAULT_CONTACT_URL = "https://policy-diff.vercel.app/about/crawler";

export function contactUrl(): string {
  return process.env.CRAWLER_CONTACT_URL || DEFAULT_CONTACT_URL;
}

/**
 * Identifies the crawler and, more importantly, says where to complain. Site
 * operators block anonymous scrapers; they rarely block one that leaves a URL.
 */
export function userAgent(): string {
  return `${CRAWLER_NAME}/${CRAWLER_VERSION} (+${contactUrl()})`;
}

/** The token robots.txt groups are matched against. */
export const ROBOTS_TOKEN = CRAWLER_NAME.toLowerCase();
