-- Hand-written, and first (ADR-056): the name indexes below are rebuilt on
-- search_text(), which ignores punctuation as well as accents and case, so
-- "saint laurent" finds "Pharmacie Saint-Laurent". 0042 indexed
-- immutable_unaccent(name) alone, and a hyphen or an apostrophe in a name
-- then had to be typed exactly. Runs of punctuation and spaces become one
-- space; Chinese characters are neither, and stay.
--
-- public.immutable_unaccent, qualified: Postgres builds an index with the
-- search path set to pg_catalog only (since 17), so an unqualified call in a
-- function an index uses is not found then ("function immutable_unaccent
-- (text) does not exist"), though it is in a session. Every name in the body
-- is either qualified or in pg_catalog.
CREATE OR REPLACE FUNCTION public.search_text(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(btrim(regexp_replace(public.immutable_unaccent($1), '[[:punct:][:space:]]+', ' ', 'g'))) $$;
--> statement-breakpoint
DROP INDEX "partners_name_trgm_idx";--> statement-breakpoint
DROP INDEX "product_translations_name_trgm_idx";--> statement-breakpoint
DROP INDEX "product_variants_name_trgm_idx";--> statement-breakpoint
DROP INDEX "products_name_trgm_idx";--> statement-breakpoint
DROP INDEX "variant_translations_name_trgm_idx";--> statement-breakpoint
CREATE INDEX "partners_name_trgm_idx" ON "partners" USING gin (search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_translations_name_trgm_idx" ON "product_translations" USING gin (search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_variants_name_trgm_idx" ON "product_variants" USING gin (search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_name_trgm_idx" ON "products" USING gin (search_text("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "variant_translations_name_trgm_idx" ON "variant_translations" USING gin (search_text("name") gin_trgm_ops);