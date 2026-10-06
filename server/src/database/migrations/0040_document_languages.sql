-- Hand-written, and first: before the generated statements make these
-- columns required. A shipment, issued invoice or credit note written
-- between 0039 and the code that names its language has none. Only a
-- development database can hold one, and no partner had a language then,
-- so the organization's default, English, is what it would have printed in.
UPDATE shipments SET language = 'en' WHERE language IS NULL;
--> statement-breakpoint
UPDATE credit_notes SET language = 'en' WHERE language IS NULL;
--> statement-breakpoint
ALTER TABLE invoices DISABLE TRIGGER invoices_set_updated_at;
--> statement-breakpoint
UPDATE invoices SET language = 'en' WHERE status <> 'draft' AND language IS NULL;
--> statement-breakpoint
ALTER TABLE invoices ENABLE TRIGGER invoices_set_updated_at;
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_issued_shape_check";--> statement-breakpoint
ALTER TABLE "credit_notes" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_shape_check" CHECK ("invoices"."status" = 'draft' or (
            "invoices"."number" is not null and "invoices"."invoice_date" is not null
            and "invoices"."issued_at" is not null and "invoices"."issued_by" is not null
            and "invoices"."subtotal" is not null and "invoices"."tax_total" is not null and "invoices"."total" is not null
            and "invoices"."seller_name" is not null and "invoices"."seller_line1" is not null and "invoices"."seller_country" is not null
            and "invoices"."bill_to_name" is not null and "invoices"."bill_to_line1" is not null and "invoices"."bill_to_country" is not null
            and "invoices"."language" is not null
          ));