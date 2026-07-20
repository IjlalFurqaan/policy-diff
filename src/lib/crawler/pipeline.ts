import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { changes, companies, documents, snapshots } from "@/db/schema";
import { summarizeChange, shouldPublish, type Summarizer } from "@/lib/ai";

import { diffDocuments } from "./diff";
import { extractContent } from "./extract";
import { DomainGate, fetchDocument } from "./fetcher";
import { contentHash } from "./hash";
import { clearRobotsCache } from "./robots";

export const DEFAULT_BATCH_SIZE = 10;

export type DocumentStatus =
  | "baseline"
  | "unchanged"
  | "cosmetic"
  | "published"
  | "held-for-review"
  | "skipped"
  | "error";

export interface DocumentOutcome {
  documentId: string;
  companySlug: string;
  companyName: string;
  type: "tos" | "privacy";
  sourceUrl: string;
  status: DocumentStatus;
  detail?: string;
  changeId?: string;
  changeRatio?: number;
  severity?: number;
  summarizer?: string;
}

export interface CrawlReport {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  considered: number;
  outcomes: DocumentOutcome[];
  /** Company slugs whose cached pages are now stale. */
  revalidate: string[];
}

export interface CrawlOptions {
  limit?: number;
  /** Overridable so tests can exercise the publish path without an API key. */
  summarizer?: Summarizer;
  /** Development only: crawl one document regardless of its check time. */
  documentId?: string;
}

/**
 * One cron invocation.
 *
 * Deliberately not "crawl everything": the oldest `limit` documents are taken,
 * processed, and the run ends. Each host is contacted at most once, so a run
 * spreads itself across companies rather than hammering one.
 */
export async function runCrawl(options: CrawlOptions = {}): Promise<CrawlReport> {
  const limit = options.limit ?? DEFAULT_BATCH_SIZE;
  const summarizer = options.summarizer ?? summarizeChange;
  const startedAt = new Date();

  clearRobotsCache();
  const gate = new DomainGate();

  const due = await db
    .select({
      id: documents.id,
      type: documents.type,
      sourceUrl: documents.sourceUrl,
      companyId: companies.id,
      companySlug: companies.slug,
      companyName: companies.name,
    })
    .from(documents)
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(options.documentId ? eq(documents.id, options.documentId) : undefined)
    .orderBy(asc(sql`${documents.lastCheckedAt} nulls first`))
    .limit(limit);

  const outcomes: DocumentOutcome[] = [];
  const revalidate = new Set<string>();

  for (const doc of due) {
    const outcome = await processDocument(doc, gate, summarizer);
    outcomes.push(outcome);
    if (outcome.status === "published") revalidate.add(doc.companySlug);
  }

  const finishedAt = new Date();
  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    considered: due.length,
    outcomes,
    revalidate: [...revalidate],
  };
}

interface DueDocument {
  id: string;
  type: "tos" | "privacy";
  sourceUrl: string;
  companyId: string;
  companySlug: string;
  companyName: string;
}

async function processDocument(
  doc: DueDocument,
  gate: DomainGate,
  summarizer: Summarizer,
): Promise<DocumentOutcome> {
  const base = {
    documentId: doc.id,
    companySlug: doc.companySlug,
    companyName: doc.companyName,
    type: doc.type,
    sourceUrl: doc.sourceUrl,
  };

  const fetched = await fetchDocument(doc.sourceUrl, gate);

  if (!fetched.ok) {
    if (fetched.skipped) {
      // Not the document's fault — leave its clock alone so it is first in
      // line next run rather than waiting a full rotation.
      return { ...base, status: "skipped", detail: fetched.message };
    }
    await db
      .update(documents)
      .set({ lastCheckedAt: new Date(), lastErrorAt: new Date(), lastError: fetched.message })
      .where(eq(documents.id, doc.id));
    return { ...base, status: "error", detail: fetched.message };
  }

  const { title, extractedText } = extractContent(fetched.html, fetched.finalUrl);

  if (extractedText.length < 200) {
    const detail = `extracted only ${extractedText.length} characters — page is probably not the policy`;
    await db
      .update(documents)
      .set({ lastCheckedAt: new Date(), lastErrorAt: new Date(), lastError: detail })
      .where(eq(documents.id, doc.id));
    return { ...base, status: "error", detail };
  }

  const hash = contentHash(extractedText);

  // The common path: one indexed row, one string comparison, one timestamp
  // write. No snapshot is stored and nothing is diffed.
  const [previous] = await db
    .select({ id: snapshots.id, contentHash: snapshots.contentHash })
    .from(snapshots)
    .where(eq(snapshots.documentId, doc.id))
    .orderBy(desc(snapshots.fetchedAt))
    .limit(1);

  const checkedAt = new Date();

  if (previous && previous.contentHash === hash) {
    await markChecked(doc, checkedAt);
    return { ...base, status: "unchanged" };
  }

  const [inserted] = await db
    .insert(snapshots)
    .values({
      documentId: doc.id,
      rawHtml: fetched.html,
      extractedText,
      contentHash: hash,
      fetchedAt: checkedAt,
    })
    .returning({ id: snapshots.id });

  if (!previous) {
    await markChecked(doc, checkedAt);
    return { ...base, status: "baseline" };
  }

  const [previousFull] = await db
    .select({ extractedText: snapshots.extractedText })
    .from(snapshots)
    .where(eq(snapshots.id, previous.id))
    .limit(1);

  const diff = diffDocuments(previousFull.extractedText, extractedText);
  const diffJson = {
    version: diff.version,
    parts: diff.parts,
    hunks: diff.hunks,
    stats: diff.stats,
  } as const;

  if (diff.cosmetic) {
    const [change] = await db
      .insert(changes)
      .values({
        documentId: doc.id,
        fromSnapshotId: previous.id,
        toSnapshotId: inserted.id,
        diffJson,
        changeRatio: diff.stats.ratio,
        cosmetic: true,
        published: false,
        needsReview: false,
        detectedAt: checkedAt,
      })
      .returning({ id: changes.id });

    await markChecked(doc, checkedAt);
    return {
      ...base,
      status: "cosmetic",
      detail: diff.cosmeticReason ?? undefined,
      changeId: change.id,
      changeRatio: diff.stats.ratio,
    };
  }

  const summary = await summarizer({
    companyName: doc.companyName,
    documentType: doc.type,
    documentTitle: title,
    hunks: diff.hunks,
    changedWords: diff.stats.addedWords + diff.stats.removedWords,
    totalWords: diff.stats.totalWords,
  });

  const publish = shouldPublish(summary);

  const [change] = await db
    .insert(changes)
    .values({
      documentId: doc.id,
      fromSnapshotId: previous.id,
      toSnapshotId: inserted.id,
      diffJson,
      headline: summary.headline,
      summary: summary.summary,
      userImpact: summary.userImpact,
      severity: summary.severity,
      tags: summary.tags,
      confidence: summary.confidence,
      changeRatio: diff.stats.ratio,
      cosmetic: false,
      needsReview: !publish,
      published: publish,
      detectedAt: checkedAt,
    })
    .returning({ id: changes.id });

  await markChecked(doc, checkedAt);

  return {
    ...base,
    status: publish ? "published" : "held-for-review",
    changeId: change.id,
    changeRatio: diff.stats.ratio,
    severity: summary.severity,
    summarizer: summary.provider,
    detail: publish ? undefined : `confidence ${summary.confidence}`,
  };
}

async function markChecked(doc: DueDocument, at: Date): Promise<void> {
  await db
    .update(documents)
    .set({ lastCheckedAt: at, lastErrorAt: null, lastError: null })
    .where(eq(documents.id, doc.id));
  await db.update(companies).set({ lastCheckedAt: at }).where(eq(companies.id, doc.companyId));
}

/** Marks a change as published after a human clears it. Used by scripts. */
export async function publishChange(changeId: string): Promise<string | null> {
  const [row] = await db
    .update(changes)
    .set({ published: true, needsReview: false })
    .where(and(eq(changes.id, changeId), eq(changes.cosmetic, false)))
    .returning({ documentId: changes.documentId });
  if (!row) return null;

  const [company] = await db
    .select({ slug: companies.slug })
    .from(documents)
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(eq(documents.id, row.documentId))
    .limit(1);

  return company?.slug ?? null;
}
