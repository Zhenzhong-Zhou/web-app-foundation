-- Hand-written, and first (ADR-056): the indexes below need both extensions
-- and the wrapper. pg_trgm and unaccent are trusted extensions, so the
-- database's owner may create them, on Render as locally.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE, since its dictionary could change, and an index
-- expression must be IMMUTABLE. Naming the dictionary makes the result fixed
-- for a given input, which is what the wrapper promises.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "name_pinyin" text;--> statement-breakpoint
ALTER TABLE "product_translations" ADD COLUMN "name_pinyin" text;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "name_pinyin" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "name_pinyin" text;--> statement-breakpoint
ALTER TABLE "variant_translations" ADD COLUMN "name_pinyin" text;--> statement-breakpoint
CREATE INDEX "credit_notes_number_trgm_idx" ON "credit_notes" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "invoices_number_trgm_idx" ON "invoices" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lots_code_trgm_idx" ON "lots" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_reference_trgm_idx" ON "orders" USING gin ("reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_name_trgm_idx" ON "partners" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_code_trgm_idx" ON "partners" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_tax_id_trgm_idx" ON "partners" USING gin ("tax_id" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "partners_name_pinyin_trgm_idx" ON "partners" USING gin ("name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_translations_name_trgm_idx" ON "product_translations" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_translations_name_pinyin_trgm_idx" ON "product_translations" USING gin ("name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_sku_trgm_idx" ON "product_variants" USING gin ("sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_name_trgm_idx" ON "product_variants" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_name_pinyin_trgm_idx" ON "product_variants" USING gin ("name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "production_orders_reference_trgm_idx" ON "production_orders" USING gin ("reference" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_pinyin_trgm_idx" ON "products" USING gin ("name_pinyin" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "return_authorizations_number_trgm_idx" ON "return_authorizations" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "variant_translations_name_trgm_idx" ON "variant_translations" USING gin (immutable_unaccent("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "variant_translations_name_pinyin_trgm_idx" ON "variant_translations" USING gin ("name_pinyin" gin_trgm_ops);