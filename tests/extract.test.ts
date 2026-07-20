import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { extractContent, normalizeText } from "@/lib/crawler/extract";
import { contentHash } from "@/lib/crawler/hash";

const FIXTURE = readFileSync(path.join(process.cwd(), "fixtures", "fake-tos.html"), "utf8");
const URL = "https://northwind-sound.example/legal/terms";

describe("normalizeText", () => {
  it("collapses every whitespace run without touching case", () => {
    expect(normalizeText("The   Service\t\tis\n\n\nprovided")).toBe(
      "The Service is\nprovided",
    );
  });

  it("drops blank lines and trims each line", () => {
    expect(normalizeText("  a  \n\n\n   b   \n")).toBe("a\nb");
  });
});

describe("extractContent", () => {
  const result = extractContent(FIXTURE, URL);

  it("keeps the substance of the document", () => {
    expect(result.extractedText).toContain("These Terms of Service govern your use");
    expect(result.extractedText).toContain("We retain your listening history for 12 months");
    expect(result.extractedText).toContain("Governing law");
  });

  it("drops the cookie banner, navigation and footer chrome", () => {
    expect(result.extractedText).not.toContain("Accept all cookies");
    expect(result.extractedText).not.toContain("Manage preferences");
    expect(result.extractedText).not.toMatch(/window\.__analytics/);
    expect(result.extractedText).not.toContain("Northwind Sound Ltd.");
  });

  it("reads the title", () => {
    expect(result.title).toBe("Terms of Service — Northwind Sound");
  });

  it("is stable across reformatting of the source HTML", () => {
    const reformatted = FIXTURE.replace(/\n\s+/g, "\n      ").replace(
      "<h2>5. Data we hold</h2>",
      "\n\n   <h2>5.   Data we hold</h2>\n\n",
    );
    const again = extractContent(reformatted, URL);

    expect(contentHash(again.extractedText)).toBe(contentHash(result.extractedText));
  });

  it("changes when the words change", () => {
    const edited = extractContent(FIXTURE.replace("12 months", "36 months"), URL);
    expect(contentHash(edited.extractedText)).not.toBe(contentHash(result.extractedText));
  });
});

describe("contentHash", () => {
  it("is a stable sha256 hex digest", () => {
    expect(contentHash("policy")).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash("policy")).toBe(contentHash("policy"));
    expect(contentHash("policy")).not.toBe(contentHash("Policy"));
  });
});
