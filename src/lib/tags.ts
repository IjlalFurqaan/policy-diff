/**
 * The fixed tag vocabulary. The model may only return values from this list,
 * the database enforces it with a check constraint, and the UI renders every
 * one of them — so adding a tag means touching all three.
 */
export const CHANGE_TAGS = [
  "data-retention",
  "third-party-sharing",
  "arbitration",
  "pricing",
  "content-licensing",
  "account-termination",
  "tracking",
  "jurisdiction",
] as const;

export type ChangeTag = (typeof CHANGE_TAGS)[number];

export function isChangeTag(value: string): value is ChangeTag {
  return (CHANGE_TAGS as readonly string[]).includes(value);
}

export const TAG_LABELS: Record<ChangeTag, string> = {
  "data-retention": "Data retention",
  "third-party-sharing": "Third-party sharing",
  arbitration: "Arbitration",
  pricing: "Pricing",
  "content-licensing": "Content licensing",
  "account-termination": "Account termination",
  tracking: "Tracking",
  jurisdiction: "Jurisdiction",
};

export const TAG_DESCRIPTIONS: Record<ChangeTag, string> = {
  "data-retention": "How long your data is kept, and when it is deleted.",
  "third-party-sharing": "Who else your data is handed to.",
  arbitration: "Your right to sue, to a jury, or to join a class action.",
  pricing: "What things cost, and how charges are applied.",
  "content-licensing": "The rights you grant over what you upload.",
  "account-termination": "When and how an account can be suspended or closed.",
  tracking: "Cookies, device identifiers and behavioural profiling.",
  jurisdiction: "Which country's courts and laws govern the agreement.",
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Editorial",
  2: "Minor",
  3: "Notable",
  4: "Significant",
  5: "Major",
};

export function severityLabel(severity: number | null): string {
  if (severity == null) return "Unrated";
  return SEVERITY_LABELS[severity] ?? "Unrated";
}
