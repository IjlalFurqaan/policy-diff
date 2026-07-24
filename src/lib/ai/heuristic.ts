import { countWords, type DiffHunk } from "@/lib/crawler/diff";
import { TAG_LABELS, type ChangeTag } from "@/lib/tags";

import type { SummarizeInput } from "./prompt";
import type { SummarizerResult } from "./schema";

/**
 * Offline fallback for when ANTHROPIC_API_KEY is unset.
 *
 * This is a keyword classifier, not a reader. It exists so the pipeline can be
 * developed and demonstrated end to end without a key, and it is deliberately
 * pessimistic about its own confidence: only a clean single-topic substitution
 * with a quantity on both sides earns "medium", which is the bar for
 * publishing. Everything else comes back "low" and is held for review.
 */

interface TagRule {
  tag: ChangeTag;
  weight: number;
  patterns: RegExp[];
}

const TAG_RULES: TagRule[] = [
  {
    tag: "data-retention",
    weight: 4,
    patterns: [/\bretain(ed|ing|s)?\b/i, /\bretention\b/i, /\bdelet(e|ed|ion)\b/i, /\bstore[ds]?\b/i, /\bkeep\b/i, /\barchiv/i],
  },
  {
    tag: "third-party-sharing",
    weight: 5,
    patterns: [/\bthird[- ]part(y|ies)\b/i, /\bshare[ds]?\b/i, /\bsharing\b/i, /\bdisclos/i, /\bpartners?\b/i, /\baffiliates?\b/i, /\bsell\b/i, /\bvendors?\b/i],
  },
  {
    tag: "arbitration",
    weight: 5,
    patterns: [/\barbitrat/i, /\bclass action\b/i, /\bjury\b/i, /\bwaiv(e|er|es)\b/i, /\bdispute resolution\b/i, /\bsmall claims\b/i],
  },
  {
    tag: "pricing",
    weight: 4,
    patterns: [/\bfees?\b/i, /\bprice[sd]?\b/i, /\bpricing\b/i, /\bcharge[ds]?\b/i, /\bbilling\b/i, /\brefunds?\b/i, /\bsubscription\b/i, /\brenew(al|s|ed)?\b/i],
  },
  {
    tag: "content-licensing",
    weight: 4,
    patterns: [/\blicen[cs]e[ds]?\b/i, /\byour content\b/i, /\buser content\b/i, /\bsublicens/i, /\broyalty[- ]free\b/i, /\bperpetual\b/i, /\bintellectual property\b/i],
  },
  {
    tag: "account-termination",
    weight: 4,
    patterns: [/\bterminat/i, /\bsuspend/i, /\bdeactivat/i, /\bclose your account\b/i, /\bban(ned|ning)?\b/i],
  },
  {
    tag: "tracking",
    weight: 3,
    patterns: [/\bcookies?\b/i, /\btrack(ing|ed|s)?\b/i, /\bpixels?\b/i, /\bbeacons?\b/i, /\bdevice (id|identifier)/i, /\badvertis/i, /\bprofil(e|ing)\b/i, /\banalytics\b/i],
  },
  {
    tag: "jurisdiction",
    weight: 3,
    patterns: [/\bgovern(ed|ing) law\b/i, /\bjurisdiction\b/i, /\bvenue\b/i, /\bcourts? of\b/i, /\blaws of\b/i],
  },
];

const QUANTITY =
  /\b(\d[\d,.]*)\s*(days?|weeks?|months?|years?|%|percent|usd|eur|gbp)\b|\b[$€£]\s?\d[\d,.]*/gi;

function quantitiesIn(text: string): string[] {
  return (text.match(QUANTITY) ?? []).map((match) => match.trim());
}

/**
 * Finds the one figure that changed. Both sides are read with the hunk's
 * context attached, so unchanged figures elsewhere in the passage appear
 * identically on both sides and cancel out.
 */
function findQuantitySwap(hunks: DiffHunk[]): { from: string; to: string } | null {
  for (const hunk of hunks) {
    if (!hunk.removed || !hunk.added) continue;

    const before = quantitiesIn([hunk.contextBefore, hunk.removed, hunk.contextAfter].join(" "));
    const after = quantitiesIn([hunk.contextBefore, hunk.added, hunk.contextAfter].join(" "));
    if (before.length !== after.length) continue;

    const differing = before
      .map((value, index) => ({ from: value, to: after[index] }))
      .filter((pair) => pair.from !== pair.to);

    if (differing.length === 1) return differing[0];
  }
  return null;
}

function scoreTags(text: string): Map<ChangeTag, number> {
  const scores = new Map<ChangeTag, number>();
  for (const rule of TAG_RULES) {
    const hits = rule.patterns.filter((pattern) => pattern.test(text)).length;
    if (hits > 0) scores.set(rule.tag, hits);
  }
  return scores;
}

function weightOf(tag: ChangeTag): number {
  return TAG_RULES.find((rule) => rule.tag === tag)?.weight ?? 3;
}

function firstSentence(text: string, limit = 220): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).replace(/\s+\S*$/, "")}…`;
}

function describeShape(hunks: DiffHunk[]): {
  added: number;
  removed: number;
  replaced: number;
} {
  let added = 0;
  let removed = 0;
  let replaced = 0;
  for (const hunk of hunks) {
    if (hunk.added && hunk.removed) replaced += 1;
    else if (hunk.added) added += 1;
    else if (hunk.removed) removed += 1;
  }
  return { added, removed, replaced };
}

export function summarizeWithHeuristic(input: SummarizeInput): SummarizerResult {
  const hunks = input.hunks;
  // Topic comes from the passage, not just the edited words: swapping "12" for
  // "36" says nothing on its own, but the sentence around it says retention.
  const topicText = hunks
    .map((hunk) => [hunk.contextBefore, hunk.removed, hunk.added, hunk.contextAfter].join(" "))
    .join(" ");

  const scores = scoreTags(topicText);
  const tags = [...scores.entries()]
    .sort((a, b) => b[1] * weightOf(b[0]) - a[1] * weightOf(a[0]))
    .map(([tag]) => tag);

  const shape = describeShape(hunks);
  // Quantities are read with the context attached: the edited words are often
  // just "12" and "36", and the unit lives in the sentence around them.
  const swap = findQuantitySwap(hunks);
  const quantityChanged = swap !== null;

  // A single-passage substitution with a number on both sides, whose passage
  // is dominated by one topic, is the one pattern a rule can read about as
  // reliably as a person can. Everything else stays low-confidence.
  const dominantTag = tags[0];
  const dominantScore = dominantTag ? (scores.get(dominantTag) ?? 0) : 0;
  const runnerUpScore = tags[1] ? (scores.get(tags[1]) ?? 0) : 0;
  const cleanQuantitySwap =
    Boolean(dominantTag) &&
    dominantScore >= 2 &&
    dominantScore > runnerUpScore &&
    hunks.length === 1 &&
    shape.replaced === 1 &&
    quantityChanged;

  const confidence: SummarizerResult["confidence"] = cleanQuantitySwap ? "medium" : "low";

  const topic = tags.length > 0 ? TAG_LABELS[tags[0]] : "Policy wording";
  const headline =
    cleanQuantitySwap && swap
      ? `${topic} changed from ${swap.from} to ${swap.to}`
      : buildGenericHeadline(topic, shape, hunks.length);

  // Quote one passage rather than every fragment glued together: the hunks
  // come from different parts of the document, so concatenating them invents a
  // sentence that appears nowhere in either version.
  const largest = [...hunks].sort(
    (a, b) => countWords(b.removed) + countWords(b.added) - countWords(a.removed) - countWords(a.added),
  )[0];

  const quoted: string[] = [];
  if (largest?.removed) quoted.push(`it removed “${firstSentence(largest.removed)}”`);
  if (largest?.added) quoted.push(`it added “${firstSentence(largest.added)}”`);

  const documentLabel =
    input.documentType === "tos" ? "terms of service" : "privacy policy";
  const others = hunks.length - 1;

  const summary = [
    `${hunks.length} passage${hunks.length === 1 ? "" : "s"} of the ${documentLabel} changed.`,
    quoted.length > 0 ? `In the largest, ${quoted.join(" and ")}.` : "",
    others > 0 ? `${others} other passage${others === 1 ? "" : "s"} also changed.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const userImpact =
    cleanQuantitySwap && swap
      ? `The figure that applies to you changed from ${swap.from} to ${swap.to}.`
      : "Impact not assessed — this summary was produced without a language model and needs review.";

  const severity = cleanQuantitySwap
    ? Math.min(5, Math.max(2, weightOf(tags[0]))) as SummarizerResult["severity"]
    : 3;

  return {
    headline: headline.slice(0, 120),
    summary,
    userImpact,
    severity,
    tags: tags.slice(0, 4),
    confidence,
    provider: "heuristic",
  };
}

function buildGenericHeadline(
  topic: string,
  shape: { added: number; removed: number; replaced: number },
  hunkCount: number,
): string {
  if (shape.replaced === 0 && shape.added > 0 && shape.removed === 0) {
    return `${topic}: new wording added in ${shape.added} place${shape.added === 1 ? "" : "s"}`;
  }
  if (shape.replaced === 0 && shape.removed > 0 && shape.added === 0) {
    return `${topic}: wording removed from ${shape.removed} place${shape.removed === 1 ? "" : "s"}`;
  }
  return `${topic} reworded in ${hunkCount} place${hunkCount === 1 ? "" : "s"}`;
}
