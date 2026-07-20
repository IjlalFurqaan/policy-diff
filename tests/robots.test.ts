import { describe, expect, it } from "vitest";

import { isAllowed, parseRobotsTxt } from "@/lib/crawler/robots";

const allowed = (body: string, url: string) => isAllowed(parseRobotsTxt(body), url);

describe("parseRobotsTxt", () => {
  it("applies the wildcard group when we are not named", () => {
    const body = `User-agent: *\nDisallow: /private/`;
    expect(allowed(body, "https://x.example/private/terms")).toBe(false);
    expect(allowed(body, "https://x.example/legal/terms")).toBe(true);
  });

  it("prefers a group that names the crawler, even a more permissive one", () => {
    const body = `User-agent: *\nDisallow: /\n\nUser-agent: policydiffbot\nDisallow: /admin/`;
    expect(allowed(body, "https://x.example/legal/terms")).toBe(true);
    expect(allowed(body, "https://x.example/admin/x")).toBe(false);
  });

  it("treats an empty Disallow as no restriction", () => {
    expect(allowed(`User-agent: *\nDisallow:`, "https://x.example/anything")).toBe(true);
  });

  it("lets the longest match win, with Allow breaking a tie", () => {
    const body = `User-agent: *\nDisallow: /legal/\nAllow: /legal/terms`;
    expect(allowed(body, "https://x.example/legal/terms")).toBe(true);
    expect(allowed(body, "https://x.example/legal/other")).toBe(false);
  });

  it("supports wildcards and end-anchors", () => {
    const body = `User-agent: *\nDisallow: /*.pdf$`;
    expect(allowed(body, "https://x.example/legal/terms.pdf")).toBe(false);
    expect(allowed(body, "https://x.example/legal/terms.pdf?v=2")).toBe(true);
    expect(allowed(body, "https://x.example/legal/terms")).toBe(true);
  });

  it("handles several user-agents sharing one group", () => {
    const body = `User-agent: badbot\nUser-agent: policydiffbot\nDisallow: /legal/`;
    expect(allowed(body, "https://x.example/legal/terms")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const body = `# nothing to see\n\nUser-agent: *  # everyone\nDisallow: /x  # not here`;
    expect(allowed(body, "https://x.example/x")).toBe(false);
    expect(allowed(body, "https://x.example/y")).toBe(true);
  });

  it("reads a crawl delay from the group that applies", () => {
    expect(parseRobotsTxt(`User-agent: *\nCrawl-delay: 2.5`).crawlDelaySeconds).toBe(2.5);
    expect(parseRobotsTxt(`User-agent: other\nCrawl-delay: 9`).crawlDelaySeconds).toBe(null);
  });

  it("allows everything when the file is empty", () => {
    expect(allowed("", "https://x.example/legal/terms")).toBe(true);
  });
});
