import { hasAnthropicKey, summarizeWithClaude } from "./claude";
import { summarizeWithHeuristic } from "./heuristic";
import type { SummarizeInput } from "./prompt";
import type { SummarizerResult } from "./schema";

export type { SummarizeInput } from "./prompt";
export type { ChangeSummary, SummarizerResult } from "./schema";
export { changeSummarySchema } from "./schema";

export type Summarizer = (input: SummarizeInput) => Promise<SummarizerResult>;

/**
 * Test double for the end-to-end check on a machine with no API key. Produces
 * a deterministic, high-confidence summary so the publish path can be
 * exercised. Refuses to engage in production.
 */
function fakeSummarizerEnabled(): boolean {
  return (
    process.env.POLICY_DIFF_FAKE_SUMMARIZER === "1" &&
    process.env.NODE_ENV !== "production"
  );
}

function fakeSummarize(input: SummarizeInput): SummarizerResult {
  return { ...summarizeWithHeuristic(input), confidence: "high" };
}

/**
 * Claude when a key is configured, the offline classifier otherwise.
 *
 * A failed API call falls back rather than aborting the crawl: a change with a
 * weak summary held for review is a better outcome than a change nobody
 * noticed. The fallback always lands at low confidence, so nothing it produces
 * is published without a human.
 */
export async function summarizeChange(
  input: SummarizeInput,
): Promise<SummarizerResult> {
  if (fakeSummarizerEnabled()) return fakeSummarize(input);

  if (!hasAnthropicKey()) {
    return summarizeWithHeuristic(input);
  }

  try {
    return await summarizeWithClaude(input);
  } catch (error) {
    console.error("[summarizer] Claude call failed, falling back:", error);
    const fallback = summarizeWithHeuristic(input);
    return { ...fallback, confidence: "low" };
  }
}

/** Low-confidence summaries are held for a human instead of published. */
export function shouldPublish(summary: SummarizerResult): boolean {
  return summary.confidence !== "low";
}
