import * as z from "zod/v4";

import { CHANGE_TAGS } from "@/lib/tags";

/**
 * The contract the model must satisfy. Enforced by the API through structured
 * outputs rather than by asking nicely in the prompt and hoping — a malformed
 * summary would otherwise become a published headline.
 *
 * Numeric ranges are expressed as literal unions on purpose: structured
 * outputs does not support `minimum`/`maximum`, but it does support `enum`.
 */
export const changeSummarySchema = z.object({
  headline: z
    .string()
    .describe(
      "One sentence, under 90 characters, stating what changed. No company name, no date, no hedging.",
    ),
  summary: z
    .string()
    .describe(
      "Two to four sentences in plain language describing only what the diff literally says was added, removed or reworded.",
    ),
  userImpact: z
    .string()
    .describe(
      "One or two sentences on what is now true for a user of the service that was not true before.",
    ),
  severity: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .describe(
      "1 = editorial only. 2 = minor clarification. 3 = a real but narrow change of obligation. 4 = a broad change to user rights or company powers. 5 = a fundamental change such as new data sharing, lost legal remedies, or new charges.",
    ),
  tags: z
    .array(z.enum(CHANGE_TAGS))
    .describe("Every category the change touches. Empty if none apply."),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe(
      "How certain the legal effect of the change is. Use low whenever the effect is ambiguous or the diff lacks the surrounding text needed to judge it.",
    ),
});

export type ChangeSummary = z.infer<typeof changeSummarySchema>;

export interface SummarizerResult extends ChangeSummary {
  /** Which implementation produced this — `claude` or the offline fallback. */
  provider: "claude" | "heuristic";
  model?: string;
}
