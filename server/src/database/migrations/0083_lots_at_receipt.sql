ALTER TABLE "document_numbering" DROP CONSTRAINT "document_numbering_document_type_check";--> statement-breakpoint
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_document_type_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_reason_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_distinct_locations_check";--> statement-breakpoint
ALTER TABLE "stock_valuations" DROP CONSTRAINT "stock_valuations_kind_check";--> statement-breakpoint
ALTER TABLE "stock_valuations" DROP CONSTRAINT "stock_valuations_movement_shape_check";--> statement-breakpoint
ALTER TABLE "stock_valuations" DROP CONSTRAINT "stock_valuations_quantity_shape_check";--> statement-breakpoint
ALTER TABLE "stock_valuations" DROP CONSTRAINT "stock_valuations_needs_cost_is_zero_check";--> statement-breakpoint
DROP INDEX "stock_valuations_movement_key";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "supplier_lot" text;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "to_lot_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_lot_id_lots_id_fk" FOREIGN KEY ("to_lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lots_supplier_lot_trgm_idx" ON "lots" USING gin ("organization_id","supplier_lot" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "stock_movements_org_to_lot_idx" ON "stock_movements" USING btree ("organization_id","to_lot_id") WHERE "stock_movements"."to_lot_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_valuations_lot_change_key" ON "stock_valuations" USING btree ("movement_id",("quantity" > 0)) WHERE "stock_valuations"."kind" = 'lot_change';--> statement-breakpoint
CREATE UNIQUE INDEX "stock_valuations_movement_key" ON "stock_valuations" USING btree ("movement_id") WHERE "stock_valuations"."kind" = 'movement';--> statement-breakpoint
ALTER TABLE "document_numbering" ADD CONSTRAINT "document_numbering_document_type_check" CHECK ("document_numbering"."document_type" in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order', 'lot'));--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_document_type_check" CHECK ("document_sequences"."document_type" in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order', 'lot'));--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_lot_not_blank_check" CHECK ("lots"."supplier_lot" is null or length(btrim("lots"."supplier_lot")) > 0);--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_note_check" CHECK ("lots"."note" is null or "lots"."note" in ('tracking_started'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_lot_check" CHECK (("stock_movements"."to_lot_id" is not null) = ("stock_movements"."reason" = 'lot_change'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_change_shape_check" CHECK ("stock_movements"."reason" <> 'lot_change' or ("stock_movements"."from_location_id" is not distinct from "stock_movements"."to_location_id" and "stock_movements"."to_lot_id" is distinct from "stock_movements"."lot_id"));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_check" CHECK ("stock_movements"."reason" in ('receipt', 'shipment', 'transfer', 'adjustment', 'production', 'consumption', 'sample', 'return', 'lot_change'));--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_distinct_locations_check" CHECK ("stock_movements"."from_location_id" is null or "stock_movements"."to_location_id" is null or "stock_movements"."from_location_id" <> "stock_movements"."to_location_id" or "stock_movements"."reason" = 'lot_change');--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_kind_check" CHECK ("stock_valuations"."kind" in ('movement', 'run_close', 'correction', 'issued', 'opening', 'lot_change'));--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_movement_shape_check" CHECK (("stock_valuations"."movement_id" is not null) = ("stock_valuations"."kind" in ('movement', 'lot_change')));--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_quantity_shape_check" CHECK (("stock_valuations"."kind" in ('movement', 'opening', 'lot_change')) = ("stock_valuations"."quantity" <> 0));--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_needs_cost_is_zero_check" CHECK (not "stock_valuations"."needs_cost" or "stock_valuations"."value" = 0 or "stock_valuations"."kind" = 'lot_change');--> statement-breakpoint
-- Hand-written: every organization's lot series at its default,
-- L-2026-11-21-1 and again from 1 each day, so taking a lot's code always
-- reads a real row (ADR-073, amended by ADR-094); registration writes it
-- from here on. The release still serving reads each series it knows by
-- name; its lookup, reading every prefix, finds no kind for this one and
-- passes over it.
INSERT INTO "document_numbering" ("organization_id", "document_type", "prefix", "digits", "reset")
SELECT o."id", 'lot', 'L-{YYYY}-{MM}-{DD}-', 1, 'daily'
FROM "organizations" AS o;
