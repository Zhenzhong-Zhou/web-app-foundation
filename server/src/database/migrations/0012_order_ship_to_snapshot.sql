ALTER TABLE "orders" ADD COLUMN "ship_to_address_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_label" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_line1" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_line2" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_city" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_region" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_postal_code" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_to_country" char(2);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ship_to_address_id_addresses_id_fk" FOREIGN KEY ("ship_to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ship_to_snapshot_check" CHECK (("orders"."ship_to_line1" is null and "orders"."ship_to_country" is null)
          or ("orders"."ship_to_line1" is not null and "orders"."ship_to_country" is not null));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ship_to_country_format_check" CHECK ("orders"."ship_to_country" is null or "orders"."ship_to_country" ~ '^[A-Z]{2}$');