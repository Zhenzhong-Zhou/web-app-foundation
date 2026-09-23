ALTER TABLE "production_orders" ADD COLUMN "licence_id" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "licence_number" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "licence_authority" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_id_product_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."product_licences"("id") ON DELETE no action ON UPDATE no action;