CREATE TABLE "product_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_translations_name_not_blank_check" CHECK (length(btrim("product_translations"."name")) > 0),
	CONSTRAINT "product_translations_description_not_blank_check" CHECK ("product_translations"."description" is null or length(btrim("product_translations"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "variant_translations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_translations_name_not_blank_check" CHECK (length(btrim("variant_translations"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_draft_shape_check";--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD COLUMN "second_description" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "second_language" text;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN "second_description" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "second_language" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "document_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "document_second_language" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "required_name_languages" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "document_language" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "document_second_language" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "second_language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_translations" ADD CONSTRAINT "variant_translations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_translations" ADD CONSTRAINT "variant_translations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_translations_product_locale_key" ON "product_translations" USING btree ("product_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_translations_variant_locale_key" ON "variant_translations" USING btree ("variant_id","locale");--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_second_language_needs_first_check" CHECK ("credit_notes"."second_language" is null or "credit_notes"."language" is not null);--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_languages_differ_check" CHECK ("credit_notes"."second_language" is null or "credit_notes"."second_language" <> "credit_notes"."language");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_second_language_needs_first_check" CHECK ("invoices"."second_language" is null or "invoices"."language" is not null);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_languages_differ_check" CHECK ("invoices"."second_language" is null or "invoices"."second_language" <> "invoices"."language");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_draft_shape_check" CHECK ("invoices"."status" <> 'draft' or (
            "invoices"."number" is null and "invoices"."issued_at" is null and "invoices"."issued_by" is null
            and "invoices"."subtotal" is null and "invoices"."tax_total" is null and "invoices"."total" is null
            and "invoices"."language" is null and "invoices"."second_language" is null
          ));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_document_languages_differ_check" CHECK ("organizations"."document_second_language" is null or "organizations"."document_second_language" <> "organizations"."document_language");--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_document_second_language_needs_first_check" CHECK ("partners"."document_second_language" is null or "partners"."document_language" is not null);--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_document_languages_differ_check" CHECK ("partners"."document_second_language" is null or "partners"."document_second_language" <> "partners"."document_language");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_second_language_needs_first_check" CHECK ("shipments"."second_language" is null or "shipments"."language" is not null);--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_languages_differ_check" CHECK ("shipments"."second_language" is null or "shipments"."second_language" <> "shipments"."language");
--> statement-breakpoint
-- Hand-written: drizzle-kit does not model triggers (see columns.ts).
CREATE TRIGGER product_translations_set_updated_at BEFORE UPDATE ON product_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER variant_translations_set_updated_at BEFORE UPDATE ON variant_translations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Hand-written: every document before ADR-054 was printed in English, so
-- that is what a reprint of one must say. Drafts stay empty: they resolve
-- their language at issue.
UPDATE shipments SET language = 'en';
--> statement-breakpoint
UPDATE credit_notes SET language = 'en';
--> statement-breakpoint
-- An issued invoice's updated_at says when it was last changed by someone.
-- A backfill is not that, so its trigger is off for this one statement.
ALTER TABLE invoices DISABLE TRIGGER invoices_set_updated_at;
--> statement-breakpoint
UPDATE invoices SET language = 'en' WHERE status <> 'draft';
--> statement-breakpoint
ALTER TABLE invoices ENABLE TRIGGER invoices_set_updated_at;