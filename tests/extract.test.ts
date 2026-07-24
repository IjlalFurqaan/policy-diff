import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { extractContent, normalizeText } from "@/lib/crawler/extract";
import { contentHash } from "@/lib/crawler/hash";

const FIXTURE = readFileSync(path.join(process.cwd(), "fixtures", "fake-tos.html"), "utf8");
const URL = "https://northwind-sound.example/legal/terms";

describe("normalizeText", () => {
  it("collapses every whitespace run, newlines included, without touching case", () => {
    expect(normalizeText("The   Service\t\tis\n\n\nprovided")).toBe(
      "The Service is provided",
    );
  });

  it("trims and drops empty blocks", () => {
    expect(normalizeText("  the Service  ")).toBe("the Service");
    expect(normalizeText("   \n\t  ")).toBe("");
  });
});

describe("domToText", () => {
  it("gives each block its own line and folds source indentation away", () => {
    const compact = extractContent("<body><p>One two.</p><p>Three four.</p></body>", URL);
    const indented = extractContent(
      "<body>\n  <p>\n    One\n    two.\n  </p>\n\n  <p>Three\tfour.</p>\n</body>",
      URL,
    );

    expect(compact.extractedText).toBe("One two.\nThree four.");
    expect(indented.extractedText).toBe(compact.extractedText);
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
    // The copyright line, not the company name — the name legitimately
    // appears in the body where the contracting entity is identified.
    expect(result.extractedText).not.toContain("© 2026");
    expect(result.extractedText).toContain("Northwind Sound Ltd., a company");
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

  // The done-criterion depends on this: a whitespace-only edit has to be
  // caught by the hash, on the cheap path, before anything is diffed.
  it("hashes identically when whitespace inside a paragraph changes", () => {
    const respaced = FIXTURE.replace(
      "We retain your listening history",
      "We   retain\n          your listening\thistory",
    );

    expect(contentHash(extractContent(respaced, URL).extractedText)).toBe(
      contentHash(result.extractedText),
    );
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
