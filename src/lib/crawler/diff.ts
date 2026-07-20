import { diffWords } from "diff";

/** Below this share of changed words an edit is a cosmetic-filter candidate. */
export const COSMETIC_RATIO_THRESHOLD = 0.005;

/** Sentences of surrounding context sent to the model with each hunk. */
export const CONTEXT_SENTENCES = 2;

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffPart {
  op: DiffOp;
  value: string;
}

export interface DiffHunk {
  /** Position of this hunk in the document, 0-based. */
  index: number;
  removed: string;
  added: string;
  contextBefore: string;
  contextAfter: string;
}

export interface DiffStats {
  addedWords: number;
  removedWords: number;
  totalWords: number;
  /** changed / total, 0..1. */
  ratio: number;
}

export interface DiffJson {
  version: 1;
  parts: DiffPart[];
  hunks: DiffHunk[];
  stats: DiffStats;
}

export type CosmeticReason =
  | "punctuation-only"
  | "date-only"
  | "reordering-only"
  | null;

export interface DiffResult extends DiffJson {
  cosmetic: boolean;
  cosmeticReason: CosmeticReason;
}

// ---------------------------------------------------------------------------
// Tokenising
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function words(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

/**
 * Words that flip the legal meaning of a sentence, mapped to a canonical form.
 * A change that adds or drops one of these is never cosmetic, however small it
 * looks by word count — "we do not sell your data" and "we do sell your data"
 * differ by one word.
 *
 * Every auxiliary contraction collapses to `not`, so rewriting "cannot" as
 * "can't" or "do not" as "don't" reads as the same negation rather than as a
 * swap of one negation for another.
 */
const NEGATIONS = new Map<string, string>([
  ["not", "not"],
  ["cannot", "not"],
  ["cant", "not"],
  ["wont", "not"],
  ["dont", "not"],
  ["doesnt", "not"],
  ["didnt", "not"],
  ["isnt", "not"],
  ["arent", "not"],
  ["wasnt", "not"],
  ["werent", "not"],
  ["shant", "not"],
  ["shouldnt", "not"],
  ["wouldnt", "not"],
  ["couldnt", "not"],
  ["havent", "not"],
  ["hasnt", "not"],
  ["hadnt", "not"],
  ["no", "no"],
  ["none", "no"],
  ["never", "never"],
  ["nor", "nor"],
  ["neither", "neither"],
  ["without", "without"],
  ["unless", "unless"],
  ["except", "except"],
  ["excluding", "except"],
  ["prohibited", "prohibited"],
  ["forbidden", "prohibited"],
  ["unable", "unable"],
  ["ineligible", "ineligible"],
]);

function negationCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of words(text)) {
    // Strip punctuation and apostrophes so "don't," and "dont" agree.
    const canonical = NEGATIONS.get(raw.toLowerCase().replace(/[^a-z]/g, ""));
    if (canonical) {
      counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    }
  }
  return counts;
}

/** True when the edit adds or removes any negation word. */
export function negationChanged(before: string, after: string): boolean {
  const a = negationCounts(before);
  const b = negationCounts(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const key of keys) {
    if ((a.get(key) ?? 0) !== (b.get(key) ?? 0)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cosmetic normalisation
// ---------------------------------------------------------------------------

const SMART_SINGLE_QUOTES = /[‘’‚‛′´`]/g;
const SMART_DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐‑‒–—―−]/g;
const BULLETS = /[•·●▪]/g;
/** Non-breaking, thin, figure, narrow and ideographic spaces. */
const EXOTIC_SPACES = /[  -   　]/g;
/** Zero-width characters and the soft hyphen: no meaning, pure formatting. */
const INVISIBLES = /[​‌‍﻿­]/g;

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

/**
 * Collapses the typographic noise the spec calls out as usually-cosmetic so
 * two versions can be compared for real equality: smart quotes, dashes,
 * ellipses, bullets and exotic whitespace all fold to their ASCII equivalents.
 *
 * Case is preserved. Case matters in legal text — a defined term like
 * "Services" is not the same as "services".
 */
export function punctuationNormalize(text: string): string {
  return text
    .replace(SMART_SINGLE_QUOTES, "'")
    .replace(SMART_DOUBLE_QUOTES, '"')
    .replace(DASHES, "-")
    .replace(/…/g, "...")
    .replace(BULLETS, "*")
    .replace(EXOTIC_SPACES, " ")
    .replace(INVISIBLES, "")
    // Space drifting in front of a separator during reformatting.
    .replace(/\s+([,;:.])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Replaces date literals with a placeholder so a rotated date compares equal. */
export function dateNormalize(text: string): string {
  return (
    text
      // 2025-03-14
      .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, "@date")
      // 14/03/2025, 3.14.25
      .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, "@date")
      // March 14, 2025
      .replace(
        new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
        "@date",
      )
      // 14 March 2025
      .replace(
        new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})\\.?,?\\s+\\d{4}\\b`, "gi"),
        "@date",
      )
      // March 2025
      .replace(new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"), "@date")
  );
}

function multisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const word of a) counts.set(word, (counts.get(word) ?? 0) + 1);
  for (const word of b) {
    const next = (counts.get(word) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(word, next);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

const ABBREVIATION_TAIL =
  /(?:\b(?:e\.g|i\.e|etc|vs|no|inc|ltd|llc|co|corp|dept|approx|art|sec|para|cf|al)\.|\b[A-Z]\.|\b\d+\.)$/i;

/**
 * Good-enough sentence splitter for legal prose: break after . ! ? or ; when
 * followed by whitespace, unless the fragment ends in a common abbreviation or
 * a bare section number ("Section 4.2", "e.g.", "Inc.").
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const out: string[] = [];
  let current = "";
  for (const part of trimmed.split(/(?<=[.!?;])\s+/)) {
    current = current ? `${current} ${part}` : part;
    if (!ABBREVIATION_TAIL.test(current)) {
      out.push(current);
      current = "";
    }
  }
  if (current) out.push(current);
  return out;
}

function lastSentences(text: string, count: number): string {
  const sentences = splitSentences(text);
  return sentences.slice(Math.max(0, sentences.length - count)).join(" ").trim();
}

function firstSentences(text: string, count: number): string {
  return splitSentences(text).slice(0, count).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------

function toParts(before: string, after: string): DiffPart[] {
  return diffWords(before, after).map(
    (change): DiffPart => ({
      op: change.added ? "insert" : change.removed ? "delete" : "equal",
      value: change.value,
    }),
  );
}

/**
 * Groups the raw diff into hunks: each contiguous run of insert/delete parts
 * becomes one hunk carrying `contextSentences` sentences on either side. This
 * is the unit sent to the model — never the whole document.
 */
export function buildHunks(
  parts: DiffPart[],
  contextSentences = CONTEXT_SENTENCES,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;

  while (i < parts.length) {
    if (parts[i].op === "equal") {
      i += 1;
      continue;
    }

    const start = i;
    let removed = "";
    let added = "";
    while (i < parts.length && parts[i].op !== "equal") {
      if (parts[i].op === "delete") removed += parts[i].value;
      else added += parts[i].value;
      i += 1;
    }

    const previous = start > 0 ? parts[start - 1].value : "";
    const next = i < parts.length ? parts[i].value : "";

    hunks.push({
      index: hunks.length,
      removed: removed.trim(),
      added: added.trim(),
      contextBefore: lastSentences(previous, contextSentences),
      contextAfter: firstSentences(next, contextSentences),
    });
  }

  return hunks;
}

export function computeStats(parts: DiffPart[], before: string, after: string): DiffStats {
  let addedWords = 0;
  let removedWords = 0;
  for (const part of parts) {
    if (part.op === "insert") addedWords += countWords(part.value);
    if (part.op === "delete") removedWords += countWords(part.value);
  }
  const totalWords = Math.max(countWords(before), countWords(after));
  const ratio = totalWords === 0 ? 0 : (addedWords + removedWords) / totalWords;
  return { addedWords, removedWords, totalWords, ratio };
}

/**
 * Word-level diff plus the cosmetic verdict.
 *
 * An edit is cosmetic when it is under the ratio threshold, no sentence gained
 * or lost a negation, and one of the following holds after normalisation: the
 * two versions are identical bar punctuation, identical bar a rotated date, or
 * the same words in a different order.
 */
export function diffDocuments(before: string, after: string): DiffResult {
  const parts = toParts(before, after);
  const stats = computeStats(parts, before, after);
  const hunks = buildHunks(parts);
  const cosmeticReason = classifyCosmetic(before, after, stats, hunks);

  return {
    version: 1,
    parts,
    hunks,
    stats,
    cosmetic: cosmeticReason !== null,
    cosmeticReason,
  };
}

function classifyCosmetic(
  before: string,
  after: string,
  stats: DiffStats,
  hunks: DiffHunk[],
): CosmeticReason {
  if (stats.ratio >= COSMETIC_RATIO_THRESHOLD) return null;

  // Negation is checked per hunk against the sentences it sits in, so a "not"
  // moving between two distant paragraphs still reads as a real change.
  for (const hunk of hunks) {
    const sentenceBefore = [hunk.contextBefore, hunk.removed, hunk.contextAfter].join(" ");
    const sentenceAfter = [hunk.contextBefore, hunk.added, hunk.contextAfter].join(" ");
    if (negationChanged(sentenceBefore, sentenceAfter)) return null;
  }

  const normalizedBefore = punctuationNormalize(before);
  const normalizedAfter = punctuationNormalize(after);
  if (normalizedBefore === normalizedAfter) return "punctuation-only";

  if (dateNormalize(normalizedBefore) === dateNormalize(normalizedAfter)) return "date-only";

  // A reordered list: the same words, in a different order, nothing gained.
  const removedWords = hunks.flatMap((hunk) => words(punctuationNormalize(hunk.removed)));
  const addedWords = hunks.flatMap((hunk) => words(punctuationNormalize(hunk.added)));
  if (removedWords.length > 0 && multisetEqual(removedWords, addedWords)) {
    return "reordering-only";
  }

  return null;
}
