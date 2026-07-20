import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { SYSTEM_PROMPT, buildUserPrompt, type SummarizeInput } from "./prompt";
import { changeSummarySchema, type SummarizerResult } from "./schema";

export const DEFAULT_MODEL = "claude-opus-4-8";

export class SummarizerError extends Error {}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Summarizes a set of diff hunks with Claude.
 *
 * The response shape is enforced by structured outputs rather than by parsing
 * whatever prose comes back — `parsed_output` is either a valid
 * ChangeSummary or the call failed.
 */
export async function summarizeWithClaude(
  input: SummarizeInput,
): Promise<SummarizerResult> {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await getClient().messages.parse({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    // Reading a legal diff correctly is the whole product; let the model
    // think about it before committing to a severity.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(changeSummarySchema),
    },
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  if (response.stop_reason === "refusal") {
    throw new SummarizerError(
      `model declined to summarize (${response.stop_details?.category ?? "unspecified"})`,
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new SummarizerError("model hit max_tokens before completing the summary");
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new SummarizerError("model returned no parseable structured output");
  }

  return { ...parsed, provider: "claude", model: response.model };
}
