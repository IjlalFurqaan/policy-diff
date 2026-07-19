import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { DiffJson } from "@/lib/crawler/diff";
import { CHANGE_TAGS } from "@/lib/tags";

export const documentTypeEnum = pgEnum("document_type", ["tos", "privacy"]);
export const confidenceEnum = pgEnum("confidence", ["low", "medium", "high"]);

export const companies = pgTable(
  "companies",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    name: text().notNull(),
    logoUrl: text(),
    tosUrl: text(),
    privacyUrl: text(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("companies_slug_idx").on(t.slug)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: documentTypeEnum().notNull(),
    sourceUrl: text().notNull(),
    // Per-document rather than per-company: the crawler picks up the ten
    // documents with the oldest check, so each one carries its own clock.
    lastCheckedAt: timestamp({ withTimezone: true }),
    // Set when a fetch fails so a permanently broken URL cannot monopolise
    // every run by staying eternally the oldest.
    lastErrorAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_company_type_idx").on(t.companyId, t.type),
    // The hot path of every cron run: ORDER BY last_checked_at NULLS FIRST.
    index("documents_last_checked_idx").on(t.lastCheckedAt.asc().nullsFirst()),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    rawHtml: text().notNull(),
    extractedText: text().notNull(),
    contentHash: text().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("snapshots_document_fetched_idx").on(t.documentId, t.fetchedAt.desc()),
    index("snapshots_content_hash_idx").on(t.contentHash),
  ],
);

export const changes = pgTable(
  "changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    fromSnapshotId: uuid()
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    toSnapshotId: uuid()
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    diffJson: jsonb().$type<DiffJson>().notNull(),

    headline: text(),
    summary: text(),
    userImpact: text(),
    severity: integer(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    confidence: confidenceEnum(),

    // Word-level churn, 0..1. Drives the cosmetic filter and is worth showing.
    changeRatio: real().notNull(),
    // True when the edit survived the ratio test but not the punctuation
    // -normalised re-compare: a rotated date, a smart quote, a reordered list.
    cosmetic: boolean().notNull().default(false),
    // Low-confidence summaries are held back for a human instead of published.
    needsReview: boolean().notNull().default(false),
    published: boolean().notNull().default(false),

    // Set once subscriber email has gone out, so a re-run cannot double-send.
    notifiedAt: timestamp({ withTimezone: true }),
    detectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("changes_feed_idx").on(t.published, t.detectedAt.desc()),
    index("changes_document_idx").on(t.documentId, t.detectedAt.desc()),
    check("changes_severity_range", sql`${t.severity} is null or (${t.severity} between 1 and 5)`),
    check(
      "changes_tags_enum",
      sql`${t.tags} <@ ARRAY[${sql.raw(CHANGE_TAGS.map((tag) => `'${tag}'`).join(", "))}]::text[]`,
    ),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: text().notNull(),
    unsubscribeToken: uuid().notNull().defaultRandom(),
    unsubscribedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_company_email_idx").on(t.companyId, t.email),
    uniqueIndex("subscriptions_token_idx").on(t.unsubscribeToken),
  ],
);

export const companiesRelations = relations(companies, ({ many }) => ({
  documents: many(documents),
  subscriptions: many(subscriptions),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  company: one(companies, {
    fields: [documents.companyId],
    references: [companies.id],
  }),
  snapshots: many(snapshots),
  changes: many(changes),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  document: one(documents, {
    fields: [snapshots.documentId],
    references: [documents.id],
  }),
}));

export const changesRelations = relations(changes, ({ one }) => ({
  document: one(documents, {
    fields: [changes.documentId],
    references: [documents.id],
  }),
  fromSnapshot: one(snapshots, {
    fields: [changes.fromSnapshotId],
    references: [snapshots.id],
    relationName: "fromSnapshot",
  }),
  toSnapshot: one(snapshots, {
    fields: [changes.toSnapshotId],
    references: [snapshots.id],
    relationName: "toSnapshot",
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  company: one(companies, {
    fields: [subscriptions.companyId],
    references: [companies.id],
  }),
}));

export type Company = typeof companies.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type Change = typeof changes.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type DocumentType = (typeof documentTypeEnum.enumValues)[number];
