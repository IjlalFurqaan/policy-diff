import { describe, expect, it } from "vitest";

import {
  buildHunks,
  countWords,
  dateNormalize,
  diffDocuments,
  negationChanged,
  punctuationNormalize,
  splitSentences,
} from "@/lib/crawler/diff";

/** A body of text long enough that a small edit lands under the 0.5% ratio. */
function longDocument(clause: string): string {
  const filler = Array.from(
    { length: 40 },
    (_, index) =>
      `Section ${index + 1}. You agree to use the Service in accordance with these terms and with all applicable laws in your country of residence.`,
  ).join(" ");
  return `${filler} ${clause} ${filler}`;
}

describe("punctuationNormalize", () => {
  it("folds smart quotes, dashes and ellipses to ASCII", () => {
    expect(punctuationNormalize("the “Service” — as is…")).toBe(
      'the "Service" - as is...',
    );
    expect(punctuationNormalize("30 days’ notice")).toBe("30 days' notice");
  });

  it("collapses exotic whitespace and strips zero-width characters", () => {
    expect(punctuationNormalize("a  b​c")).toBe("a b" + "c");
  });

  it("leaves case alone, because case matters in legal text", () => {
    expect(punctuationNormalize("the Services")).toBe("the Services");
  });
});

describe("dateNormalize", () => {
  it("normalizes the date formats policy pages actually use", () => {
    for (const date of [
      "2026-02-04",
      "04/02/2026",
      "4 February 2026",
      "February 4, 2026",
      "Feb. 4, 2026",
      "February 2026",
    ]) {
      expect(dateNormalize(`Last updated: ${date}.`)).toBe("Last updated: @date.");
    }
  });

  it("does not swallow a duration", () => {
    expect(dateNormalize("retained for 12 months")).toBe("retained for 12 months");
  });
});

describe("negationChanged", () => {
  it("catches a dropped negation", () => {
    expect(
      negationChanged("We do not sell your personal data.", "We do sell your personal data."),
    ).toBe(true);
  });

  it("catches an added negation regardless of punctuation and case", () => {
    expect(negationChanged("You may cancel.", "You may not cancel.")).toBe(true);
    expect(negationChanged("You cannot cancel", "You can't cancel")).toBe(false);
  });

  it("ignores rewording that keeps the same negations", () => {
    expect(
      negationChanged("We will not share your data.", "We shall not share your data."),
    ).toBe(false);
  });
});

describe("splitSentences", () => {
  it("does not split on abbreviations or section numbers", () => {
    expect(splitSentences("See Section 4.2 for details. Then stop.")).toEqual([
      "See Section 4.2 for details.",
      "Then stop.",
    ]);
    expect(splitSentences("Northwind Inc. is the provider. You are the user.")).toEqual([
      "Northwind Inc. is the provider.",
      "You are the user.",
    ]);
  });
});

describe("buildHunks", () => {
  it("carries two sentences of context on either side of each change", () => {
    const before = "One. Two. Three. The limit is 12 months. Four. Five. Six.";
    const after = "One. Two. Three. The limit is 36 months. Four. Five. Six.";
    const { hunks } = diffDocuments(before, after);

    expect(hunks).toHaveLength(1);
    expect(hunks[0].removed).toBe("12");
    expect(hunks[0].added).toBe("36");
    expect(hunks[0].contextBefore).toBe("Three. The limit is");
    expect(hunks[0].contextAfter).toBe("months. Four.");
  });

  it("groups a contiguous replacement into one hunk", () => {
    const parts = [
      { op: "equal" as const, value: "a " },
      { op: "delete" as const, value: "old " },
      { op: "insert" as const, value: "new " },
      { op: "equal" as const, value: "b" },
    ];
    expect(buildHunks(parts)).toHaveLength(1);
  });
});

describe("diffDocuments — cosmetic filter", () => {
  it("treats a punctuation-only edit as cosmetic", () => {
    const before = longDocument('We call this the "Service" — nothing more.');
    const after = longDocument("We call this the “Service” — nothing more.");
    const result = diffDocuments(before, after);

    expect(result.stats.ratio).toBeLessThan(0.005);
    expect(result.cosmetic).toBe(true);
    expect(result.cosmeticReason).toBe("punctuation-only");
  });

  it("treats a rotated date as cosmetic", () => {
    const before = longDocument("Last updated: 4 February 2026.");
    const after = longDocument("Last updated: 11 March 2026.");
    const result = diffDocuments(before, after);

    expect(result.cosmetic).toBe(true);
    expect(result.cosmeticReason).toBe("date-only");
  });

  it("treats a reordered list as cosmetic", () => {
    const before = longDocument("We share data with vendors, partners, auditors.");
    const after = longDocument("We share data with auditors, partners, vendors.");
    const result = diffDocuments(before, after);

    expect(result.cosmetic).toBe(true);
    expect(result.cosmeticReason).toBe("reordering-only");
  });

  it("never calls a negation flip cosmetic, however small", () => {
    const before = longDocument("We do not sell your personal data.");
    const after = longDocument("We do sell your personal data.");
    const result = diffDocuments(before, after);

    expect(result.stats.ratio).toBeLessThan(0.005);
    expect(result.cosmetic).toBe(false);
  });

  it("does not call a changed quantity cosmetic", () => {
    const before = longDocument("We retain your listening history for 12 months.");
    const after = longDocument("We retain your listening history for 36 months.");
    const result = diffDocuments(before, after);

    expect(result.cosmetic).toBe(false);
    expect(result.hunks).toHaveLength(1);
  });

  it("does not apply the filter above the ratio threshold", () => {
    const before = "We call this the \"Service\".";
    const after = "We call this the “Service”.";
    const result = diffDocuments(before, after);

    expect(result.stats.ratio).toBeGreaterThanOrEqual(0.005);
    expect(result.cosmetic).toBe(false);
  });

  it("reports zero churn for identical text", () => {
    const text = longDocument("Nothing changed here.");
    const result = diffDocuments(text, text);

    expect(result.stats.ratio).toBe(0);
    expect(result.hunks).toHaveLength(0);
  });
});

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("  one   two\nthree  ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });
});
