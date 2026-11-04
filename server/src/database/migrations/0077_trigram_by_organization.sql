-- Hand-written, and first (ADR-051's amendment for #225 and #276; ADR-056):
-- each trigram index below leads with the organization, so a search
-- rechecks its own organization's rows only, not every organization's that
-- share its trigrams. btree_gin lets a GIN index hold the uuid beside the
-- trigrams; it is a trusted extension, so the database's owner may create
-- it, on Render as locally, as 0042 created pg_trgm.
--
-- Each old index is replaced in this same migration: every read these
-- indexes serve names the organization, in the release still serving as in
-- this one, so the new indexes serve it from the moment they exist.
CREATE EXTENSION IF NOT EXISTS btree_gin;
--> statement-breakpoint
DROP INDEX "credit_notes_number_trgm_idx";--> statement-breakpoint
DROP INDEX "invoices_number_trgm_idx";--> statement-breakpoint
DROP INDEX "lots_code_trgm_idx";--> statement-breakpoint
DROP INDEX "orders_reference_trgm_idx";--> statement-breakpoint
DROP INDEX "orders_number_trgm_idx";--> statement-breakpoint
DROP INDEX "partners_name_trgm_idx";--> statement-breakpoint
DROP INDEX "partners_code_trgm_idx";--> statement-breakpoint
DROP INDEX "partners_tax_id_trgm_idx";--> statement-breakpoint
DROP INDEX "partners_name_pinyin_trgm_idx";--> statement-breakpoint
DROP INDEX "product_translations_name_trgm_idx";--> statement-breakpoint
DROP INDEX "product_translations_name_pinyin_trgm_idx";--> statement-breakpoint
DROP INDEX "product_variants_sku_trgm_idx";--> statement-breakpoint
DROP INDEX "product_variants_name_trgm_idx";--> statement-breakpoint
DROP INDEX "product_variants_name_pinyin_trgm_idx";--> statement-breakpoint
DROP INDEX "production_orders_reference_trgm_idx";--> statement-breakpoint
DROP INDEX "products_name_trgm_idx";--> statement-breakpoint
DROP INDEX "products_name_pinyin_trgm_idx";--> statement-breakpoint
DROP INDEX "return_authorizations_number_trgm_idx";--> statement-breakpoint
DROP INDEX "variant_translations_name_trgm_idx";--> statement-breakpoint
DROP INDEX "variant_translations_name_pinyin_trgm_idx";--> statement-breakpoint
CREATE INDEX "credit_notes_number_trgm_idx" ON "credit_notes" USING gin ("organization_id","number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoices_number_trgm_idx" ON "invoices" USING gin ("organization_id","number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lots_code_trgm_idx" ON "lots" USING gin ("organization_id","code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_reference_trgm_idx" ON "orders" USING gin ("organization_id","reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_number_trgm_idx" ON "orders" USING gin ("organization_id","number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_name_trgm_idx" ON "partners" USING gin ("organization_id",search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_code_trgm_idx" ON "partners" USING gin ("organization_id","code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_tax_id_trgm_idx" ON "partners" USING gin ("organization_id","tax_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_name_pinyin_trgm_idx" ON "partners" USING gin ("organization_id","name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_translations_name_trgm_idx" ON "product_translations" USING gin ("organization_id",search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_translations_name_pinyin_trgm_idx" ON "product_translations" USING gin ("organization_id","name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_sku_trgm_idx" ON "product_variants" USING gin ("organization_id","sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_name_trgm_idx" ON "product_variants" USING gin ("organization_id",search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_name_pinyin_trgm_idx" ON "product_variants" USING gin ("organization_id","name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "production_orders_reference_trgm_idx" ON "production_orders" USING gin ("organization_id","reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin ("organization_id",search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_pinyin_trgm_idx" ON "products" USING gin ("organization_id","name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "return_authorizations_number_trgm_idx" ON "return_authorizations" USING gin ("organization_id","number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "variant_translations_name_trgm_idx" ON "variant_translations" USING gin ("organization_id",search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "variant_translations_name_pinyin_trgm_idx" ON "variant_translations" USING gin ("organization_id","name_pinyin" gin_trgm_ops);