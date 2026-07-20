import { createHash } from "node:crypto";

/**
 * Content identity for a document version. Hashing the extracted text rather
 * than the HTML means a redesign, a rotated CSRF token or a new analytics tag
 * does not read as a policy change — and comparing 64 hex characters is the
 * common path of every crawl.
 */
export function contentHash(extractedText: string): string {
  return createHash("sha256").update(extractedText, "utf8").digest("hex");
}
