-- Orders get numbers of their own (ADR-071, amended): SO- for a sale, PO-
-- for a purchase, from the organization's series beside the invoice's.
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_document_type_check";--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_document_type_check" CHECK ("document_sequences"."document_type" in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order'));--> statement-breakpoint
-- Nullable while the existing orders are numbered, then required.
ALTER TABLE "orders" ADD COLUMN "number" text;--> statement-breakpoint
-- Existing orders, oldest first, per organization and direction. The id
-- breaks a tie, and sorts as created (UUIDv7, ADR-010).
UPDATE "orders" AS o
SET "number" = (CASE n."direction" WHEN 'sale' THEN 'SO-' ELSE 'PO-' END)
  || lpad(n."position"::text, 6, '0')
FROM (
  SELECT "id", "direction",
    row_number() OVER (
      PARTITION BY "organization_id", "direction"
      ORDER BY "created_at", "id"
    ) AS "position"
  FROM "orders"
) AS n
WHERE o."id" = n."id";--> statement-breakpoint
-- Each series carries on after the orders it numbered.
INSERT INTO "document_sequences" ("organization_id", "document_type", "next_value")
SELECT "organization_id",
  (CASE "direction" WHEN 'sale' THEN 'sale_order' ELSE 'purchase_order' END),
  count(*) + 1
FROM "orders"
GROUP BY "organization_id", "direction";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_number_trgm_idx" ON "orders" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_number_key" ON "orders" USING btree ("organization_id","number");
