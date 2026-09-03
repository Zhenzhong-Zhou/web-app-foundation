ALTER TABLE "products" DROP CONSTRAINT "products_type_check";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_type_check" CHECK ("products"."type" in ('good', 'material', 'packaging', 'sample', 'supply', 'equipment'));