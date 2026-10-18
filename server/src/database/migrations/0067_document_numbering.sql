-- Each organization's numbering (ADR-073): its settings per series, and a
-- counter per series and period that keeps the prefix and width it numbers
-- with.
CREATE TABLE "document_numbering" (
	"organization_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"prefix" text NOT NULL,
	"digits" integer NOT NULL,
	"reset" text DEFAULT 'never' NOT NULL,
	CONSTRAINT "document_numbering_pkey" PRIMARY KEY("organization_id","document_type"),
	CONSTRAINT "document_numbering_document_type_check" CHECK ("document_numbering"."document_type" in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order')),
	CONSTRAINT "document_numbering_reset_check" CHECK ("document_numbering"."reset" in ('never', 'yearly', 'monthly', 'daily')),
	CONSTRAINT "document_numbering_digits_check" CHECK ("document_numbering"."digits" between 1 and 10),
	CONSTRAINT "document_numbering_prefix_length_check" CHECK (length("document_numbering"."prefix") <= 40)
);
--> statement-breakpoint
-- Every organization starts with today's numbers, so nothing changes until
-- an Owner changes it.
INSERT INTO "document_numbering" ("organization_id", "document_type", "prefix", "digits", "reset")
SELECT o."id", d."document_type", d."prefix", 6, 'never'
FROM "organizations" AS o
CROSS JOIN (VALUES
  ('invoice', 'INV-'),
  ('credit_note', 'CN-'),
  ('return_authorization', 'RMA-'),
  ('sale_order', 'SO-'),
  ('purchase_order', 'PO-')
) AS d ("document_type", "prefix");--> statement-breakpoint
-- Existing counters never started again: period '', today's prefix and
-- width. Nullable while they take them, then required.
ALTER TABLE "document_sequences" ADD COLUMN "period" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD COLUMN "prefix" text;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD COLUMN "digits" integer;--> statement-breakpoint
UPDATE "document_sequences"
SET "prefix" = CASE "document_type"
    WHEN 'invoice' THEN 'INV-'
    WHEN 'credit_note' THEN 'CN-'
    WHEN 'return_authorization' THEN 'RMA-'
    WHEN 'sale_order' THEN 'SO-'
    ELSE 'PO-'
  END,
  "digits" = 6;--> statement-breakpoint
ALTER TABLE "document_sequences" ALTER COLUMN "prefix" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "document_sequences" ALTER COLUMN "digits" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "documents_in_date_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_numbering" ADD CONSTRAINT "document_numbering_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_pkey";
--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_pkey" PRIMARY KEY("organization_id","document_type","period");--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_period_check" CHECK ("document_sequences"."period" ~ '^([0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?)?$');--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_digits_check" CHECK ("document_sequences"."digits" between 1 and 10);