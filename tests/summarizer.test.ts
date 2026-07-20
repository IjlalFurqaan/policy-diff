import { describe, expect, it } from "vitest";

import { shouldPublish } from "@/lib/ai";
import { summarizeWithHeuristic } from "@/lib/ai/heuristic";
import { buildUserPrompt } from "@/lib/ai/prompt";
import { changeSummarySchema } from "@/lib/ai/schema";
import { diffDocuments, type DiffHunk } from "@/lib/crawler/diff";

function inputFor(before: string, after: string) {
  const diff = diffDocuments(before, after);
  return {
    companyName: "Northwind Sound",
    documentType: "tos" as const,
    documentTitle: "Terms of Service",
    hunks: diff.hunks,
    changedWords: diff.stats.addedWords + diff.stats.removedWords,
    totalWords: diff.stats.totalWords,
  };
}

const RETENTION_BEFORE = [
  "This policy explains what we collect.",
  "We publish a summary of it every year.",
  "We hold data only as long as we need it.",
  "We retain your listening history for 12 months after it is created, after which it is deleted.",
  "Account records are kept while your account is open.",
  "We delete them 90 days after you close it.",
  "Our governing law is Irish law.",
  "Disputes go to the courts of Ireland.",
].join(" ");
const RETENTION_AFTER = RETENTION_BEFORE.replace("12 months", "36 months");

describe("buildUserPrompt", () => {
  const prompt = buildUserPrompt(inputFor(RETENTION_BEFORE, RETENTION_AFTER));

  it("sends the changed passage and its context, not the document", () => {
    expect(prompt).toContain("<removed>12</removed>");
    expect(prompt).toContain("<added>36</added>");
    expect(prompt).toContain("<context-before>");
    // Two sentences of context each side, and not a word more.
    expect(prompt).toContain("We hold data only as long as we need it.");
    expect(prompt).not.toContain("This policy explains what we collect.");
    expect(prompt).not.toContain("Disputes go to the courts of Ireland.");
  });

  it("lists the fixed tag vocabulary", () => {
    expect(prompt).toContain("data-retention");
    expect(prompt).toContain("jurisdiction");
  });

  it("caps a pathological number of hunks", () => {
    const hunks: DiffHunk[] = Array.from({ length: 60 }, (_, index) => ({
      index,
      removed: "a",
      added: "b",
      contextBefore: "",
      contextAfter: "",
    }));
    const capped = buildUserPrompt({
      companyName: "X",
      documentType: "privacy",
      hunks,
      changedWords: 120,
      totalWords: 1000,
    });
    expect(capped).toContain("35 further changed passage(s) were omitted");
  });
});

describe("changeSummarySchema", () => {
  it("rejects a tag outside the enum", () => {
    const result = changeSummarySchema.safeParse({
      headline: "h",
      summary: "s",
      userImpact: "u",
      severity: 3,
      tags: ["made-up-tag"],
      confidence: "high",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a severity outside 1..5", () => {
    const base = {
      headline: "h",
      summary: "s",
      userImpact: "u",
      tags: [],
      confidence: "low" as const,
    };
    expect(changeSummarySchema.safeParse({ ...base, severity: 0 }).success).toBe(false);
    expect(changeSummarySchema.safeParse({ ...base, severity: 6 }).success).toBe(false);
    expect(changeSummarySchema.safeParse({ ...base, severity: 4 }).success).toBe(true);
  });
});

describe("summarizeWithHeuristic", () => {
  it("reads the topic from the surrounding sentence, not the edited words", () => {
    const summary = summarizeWithHeuristic(inputFor(RETENTION_BEFORE, RETENTION_AFTER));
    expect(summary.tags).toContain("data-retention");
    expect(summary.headline).toContain("12 months");
    expect(summary.headline).toContain("36 months");
  });

  it("is confident only about a clean single-passage quantity swap", () => {
    const clean = summarizeWithHeuristic(inputFor(RETENTION_BEFORE, RETENTION_AFTER));
    expect(clean.confidence).toBe("medium");
    expect(shouldPublish(clean)).toBe(true);

    const prose = summarizeWithHeuristic(
      inputFor(
        "We do not sell your personal data to anyone at all.",
        "We may share your personal data with advertising partners.",
      ),
    );
    expect(prose.confidence).toBe("low");
    expect(shouldPublish(prose)).toBe(false);
  });

  it("always produces a schema-valid result", () => {
    const summary = summarizeWithHeuristic(inputFor(RETENTION_BEFORE, RETENTION_AFTER));
    const { provider, model, ...payload } = summary;
    void provider;
    void model;
    expect(changeSummarySchema.safeParse(payload).success).toBe(true);
  });
});

describe("shouldPublish", () => {
  it("holds low-confidence summaries for review", () => {
    const base = {
      headline: "h",
      summary: "s",
      userImpact: "u",
      severity: 3 as const,
      tags: [],
      provider: "claude" as const,
    };
    expect(shouldPublish({ ...base, confidence: "low" })).toBe(false);
    expect(shouldPublish({ ...base, confidence: "medium" })).toBe(true);
    expect(shouldPublish({ ...base, confidence: "high" })).toBe(true);
  });
});
