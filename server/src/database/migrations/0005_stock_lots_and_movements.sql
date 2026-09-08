CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_assigned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_code_not_blank_check" CHECK (length(btrim("lots"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_org_variant_location_lot_key" UNIQUE NULLS NOT DISTINCT("organization_id","variant_id","location_id","lot_id"),
	CONSTRAINT "stock_levels_quantity_non_negative_check" CHECK ("stock_levels"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"lot_id" uuid,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"reason" text NOT NULL,
	"reason_detail" text,
	"reference_type" text,
	"reference_id" uuid,
	"note" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_reason_check" CHECK ("stock_movements"."reason" in ('receipt', 'shipment', 'transfer', 'adjustment', 'production', 'consumption', 'sample', 'return')),
	CONSTRAINT "stock_movements_quantity_positive_check" CHECK ("stock_movements"."quantity" > 0),
	CONSTRAINT "stock_movements_has_location_check" CHECK ("stock_movements"."from_location_id" is not null or "stock_movements"."to_location_id" is not null),
	CONSTRAINT "stock_movements_distinct_locations_check" CHECK ("stock_movements"."from_location_id" is null or "stock_movements"."to_location_id" is null or "stock_movements"."from_location_id" <> "stock_movements"."to_location_id"),
	CONSTRAINT "stock_movements_adjustment_note_check" CHECK ("stock_movements"."reason" <> 'adjustment' or ("stock_movements"."note" is not null and length(btrim("stock_movements"."note")) > 0))
);
--> statement-breakpoint
DROP INDEX "locations_parent_code_key";--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lots_org_variant_code_key" ON "lots" USING btree ("organization_id","variant_id","code");--> statement-breakpoint
CREATE INDEX "lots_org_expires_at_idx" ON "lots" USING btree ("organization_id","expires_at") WHERE "lots"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "lots_variant_id_idx" ON "lots" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_levels_org_location_idx" ON "stock_levels" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_levels_org_variant_idx" ON "stock_levels" USING btree ("organization_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_org_variant_created_at_idx" ON "stock_movements" USING btree ("organization_id","variant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_org_created_at_idx" ON "stock_movements" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_parent_code_key" ON "locations" USING btree ("organization_id","parent_id","code") WHERE "locations"."code" is not null and "locations"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_root_code_key" ON "locations" USING btree ("organization_id","code") WHERE "locations"."code" is not null and "locations"."parent_id" is null;