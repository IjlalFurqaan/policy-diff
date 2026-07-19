CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('tos', 'privacy');--> statement-breakpoint
CREATE TABLE "changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"from_snapshot_id" uuid NOT NULL,
	"to_snapshot_id" uuid NOT NULL,
	"diff_json" jsonb NOT NULL,
	"headline" text,
	"summary" text,
	"user_impact" text,
	"severity" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"confidence" "confidence",
	"change_ratio" real NOT NULL,
	"cosmetic" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"notified_at" timestamp with time zone,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changes_severity_range" CHECK ("changes"."severity" is null or ("changes"."severity" between 1 and 5)),
	CONSTRAINT "changes_tags_enum" CHECK ("changes"."tags" <@ ARRAY['data-retention', 'third-party-sharing', 'arbitration', 'pricing', 'content-licensing', 'account-termination', 'tracking', 'jurisdiction']::text[])
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"tos_url" text,
	"privacy_url" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"source_url" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"raw_html" text NOT NULL,
	"extracted_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"email" text NOT NULL,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_from_snapshot_id_snapshots_id_fk" FOREIGN KEY ("from_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changes" ADD CONSTRAINT "changes_to_snapshot_id_snapshots_id_fk" FOREIGN KEY ("to_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changes_feed_idx" ON "changes" USING btree ("published","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "changes_document_idx" ON "changes" USING btree ("document_id","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_company_type_idx" ON "documents" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "documents_last_checked_idx" ON "documents" USING btree ("last_checked_at" NULLS FIRST);--> statement-breakpoint
CREATE INDEX "snapshots_document_fetched_idx" ON "snapshots" USING btree ("document_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "snapshots_content_hash_idx" ON "snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_email_idx" ON "subscriptions" USING btree ("company_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_token_idx" ON "subscriptions" USING btree ("unsubscribe_token");