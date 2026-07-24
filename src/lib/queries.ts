import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/db";
import { changes, companies, documents, snapshots } from "@/db/schema";
import type { DiffJson } from "@/lib/crawler/diff";
import { FEED_TAG, changeTag, companyTag } from "@/lib/cache";
import type { ChangeTag } from "@/lib/tags";

export interface FeedItem {
  id: string;
  headline: string;
  summary: string;
  severity: number;
  tags: ChangeTag[];
  detectedAt: Date;
  changeRatio: number;
  documentType: "tos" | "privacy";
  sourceUrl: string;
  companySlug: string;
  companyName: string;
  companyLogoUrl: string | null;
}

const feedColumns = {
  id: changes.id,
  headline: changes.headline,
  summary: changes.summary,
  severity: changes.severity,
  tags: changes.tags,
  detectedAt: changes.detectedAt,
  changeRatio: changes.changeRatio,
  documentType: documents.type,
  sourceUrl: documents.sourceUrl,
  companySlug: companies.slug,
  companyName: companies.name,
  companyLogoUrl: companies.logoUrl,
};

type FeedRow = {
  [K in keyof typeof feedColumns]: K extends "headline" | "summary"
    ? string | null
    : K extends "severity"
      ? number | null
      : K extends "tags"
        ? string[]
        : FeedItem[K & keyof FeedItem];
};

function toFeedItem(row: FeedRow): FeedItem {
  return {
    id: row.id,
    headline: row.headline ?? "Change detected",
    summary: row.summary ?? "",
    severity: row.severity ?? 3,
    tags: row.tags as ChangeTag[],
    detectedAt: row.detectedAt,
    changeRatio: row.changeRatio,
    documentType: row.documentType,
    sourceUrl: row.sourceUrl,
    companySlug: row.companySlug,
    companyName: row.companyName,
    companyLogoUrl: row.companyLogoUrl,
  };
}

export async function getFeed(limit = 50): Promise<FeedItem[]> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("max");

  const rows = await db
    .select(feedColumns)
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(eq(changes.published, true))
    .orderBy(desc(changes.detectedAt))
    .limit(limit);

  return rows.map(toFeedItem);
}

export interface CompanySummary {
  slug: string;
  name: string;
  logoUrl: string | null;
  tosUrl: string | null;
  privacyUrl: string | null;
  lastCheckedAt: Date | null;
  publishedChanges: number;
}

export async function getCompanies(): Promise<CompanySummary[]> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("max");

  // Left-joined and grouped rather than a correlated subquery: inside a
  // subquery the builder emits bare column names, and `id` exists on all three
  // tables, so Postgres rejects it as ambiguous.
  return db
    .select({
      slug: companies.slug,
      name: companies.name,
      logoUrl: companies.logoUrl,
      tosUrl: companies.tosUrl,
      privacyUrl: companies.privacyUrl,
      lastCheckedAt: companies.lastCheckedAt,
      publishedChanges: sql<number>`count(${changes.id}) filter (where ${changes.published})::int`,
    })
    .from(companies)
    .leftJoin(documents, eq(documents.companyId, companies.id))
    .leftJoin(changes, eq(changes.documentId, documents.id))
    // Grouping by the primary key is enough — every other selected column is
    // functionally dependent on it.
    .groupBy(companies.id)
    .orderBy(companies.name);
}

export async function getCompanySlugs(): Promise<string[]> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("max");

  const rows = await db.select({ slug: companies.slug }).from(companies);
  return rows.map((row) => row.slug);
}

export interface CompanyTimeline {
  company: CompanySummary;
  changes: FeedItem[];
  /** Edits the cosmetic filter caught, shown so the record is complete. */
  cosmetic: Array<{
    id: string;
    detectedAt: Date;
    changeRatio: number;
    documentType: "tos" | "privacy";
  }>;
}

export async function getCompanyTimeline(slug: string): Promise<CompanyTimeline | null> {
  "use cache";
  cacheTag(companyTag(slug));
  cacheLife("max");

  const [company] = await db
    .select({
      id: companies.id,
      slug: companies.slug,
      name: companies.name,
      logoUrl: companies.logoUrl,
      tosUrl: companies.tosUrl,
      privacyUrl: companies.privacyUrl,
      lastCheckedAt: companies.lastCheckedAt,
    })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);

  if (!company) return null;

  const published = await db
    .select(feedColumns)
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .where(and(eq(companies.id, company.id), eq(changes.published, true)))
    .orderBy(desc(changes.detectedAt));

  const cosmetic = await db
    .select({
      id: changes.id,
      detectedAt: changes.detectedAt,
      changeRatio: changes.changeRatio,
      documentType: documents.type,
    })
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .where(and(eq(documents.companyId, company.id), eq(changes.cosmetic, true)))
    .orderBy(desc(changes.detectedAt))
    .limit(20);

  return {
    company: {
      slug: company.slug,
      name: company.name,
      logoUrl: company.logoUrl,
      tosUrl: company.tosUrl,
      privacyUrl: company.privacyUrl,
      lastCheckedAt: company.lastCheckedAt,
      publishedChanges: published.length,
    },
    changes: published.map(toFeedItem),
    cosmetic,
  };
}

export interface ChangeDetail extends FeedItem {
  userImpact: string | null;
  confidence: "low" | "medium" | "high" | null;
  cosmetic: boolean;
  published: boolean;
  companyId: string;
  fromFetchedAt: Date;
  toFetchedAt: Date;
}

export async function getChange(id: string): Promise<ChangeDetail | null> {
  "use cache";
  cacheTag(changeTag(id));
  cacheLife("max");

  // Aliased joins rather than correlated subqueries, for the same reason as
  // getCompanies: the aliases keep every `id` reference unambiguous.
  const fromSnapshot = alias(snapshots, "from_snapshot");
  const toSnapshot = alias(snapshots, "to_snapshot");

  const [row] = await db
    .select({
      ...feedColumns,
      userImpact: changes.userImpact,
      confidence: changes.confidence,
      cosmetic: changes.cosmetic,
      published: changes.published,
      companyId: companies.id,
      fromFetchedAt: fromSnapshot.fetchedAt,
      toFetchedAt: toSnapshot.fetchedAt,
    })
    .from(changes)
    .innerJoin(documents, eq(changes.documentId, documents.id))
    .innerJoin(companies, eq(documents.companyId, companies.id))
    .innerJoin(fromSnapshot, eq(fromSnapshot.id, changes.fromSnapshotId))
    .innerJoin(toSnapshot, eq(toSnapshot.id, changes.toSnapshotId))
    .where(eq(changes.id, id))
    .limit(1);

  if (!row) return null;

  return {
    ...toFeedItem(row),
    userImpact: row.userImpact,
    confidence: row.confidence,
    cosmetic: row.cosmetic,
    published: row.published,
    companyId: row.companyId,
    fromFetchedAt: row.fromFetchedAt,
    toFetchedAt: row.toFetchedAt,
  };
}

/**
 * The heavy half of a change: the full word-level diff. Split out from
 * `getChange` so the page can paint the summary while this is still loading.
 */
export async function getChangeDiff(id: string): Promise<DiffJson | null> {
  "use cache";
  cacheTag(changeTag(id));
  cacheLife("max");

  const [row] = await db
    .select({ diffJson: changes.diffJson })
    .from(changes)
    .where(eq(changes.id, id))
    .limit(1);

  return row?.diffJson ?? null;
}

export async function getChangeIds(limit = 200): Promise<string[]> {
  "use cache";
  cacheTag(FEED_TAG);
  cacheLife("max");

  const rows = await db
    .select({ id: changes.id })
    .from(changes)
    .where(eq(changes.published, true))
    .orderBy(desc(changes.detectedAt))
    .limit(limit);
  return rows.map((row) => row.id);
}
