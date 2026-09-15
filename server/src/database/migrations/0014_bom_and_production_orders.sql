CREATE TABLE "bom_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bom_id" uuid NOT NULL,
	"component_variant_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"supply_type" text DEFAULT 'stocked' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bom_lines_quantity_positive_check" CHECK ("bom_lines"."quantity" > 0),
	CONSTRAINT "bom_lines_supply_type_check" CHECK ("bom_lines"."supply_type" in ('stocked', 'external'))
);
--> statement-breakpoint
CREATE TABLE "boms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"output_variant_id" uuid NOT NULL,
	"output_quantity" numeric(18, 4) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"licence_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boms_output_quantity_positive_check" CHECK ("boms"."output_quantity" > 0),
	CONSTRAINT "boms_version_positive_check" CHECK ("boms"."version" > 0),
	CONSTRAINT "boms_status_check" CHECK ("boms"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "product_licences" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" text NOT NULL,
	"authority" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_licences_number_not_blank_check" CHECK (length(btrim("product_licences"."number")) > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"production_order_id" uuid NOT NULL,
	"component_variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"unit_of_measure" text NOT NULL,
	"quantity_planned" numeric(18, 4) NOT NULL,
	"quantity_consumed" numeric(18, 4) DEFAULT '0' NOT NULL,
	"supply_type" text DEFAULT 'stocked' NOT NULL,
	"external_lot_code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_lines_quantity_planned_positive_check" CHECK ("production_order_lines"."quantity_planned" > 0),
	CONSTRAINT "production_order_lines_supply_type_check" CHECK ("production_order_lines"."supply_type" in ('stocked', 'external')),
	CONSTRAINT "production_order_lines_external_consumes_nothing_check" CHECK ("production_order_lines"."quantity_consumed" >= 0 and ("production_order_lines"."supply_type" <> 'external' or "production_order_lines"."quantity_consumed" = 0)),
	CONSTRAINT "production_order_lines_external_lot_code_check" CHECK ("production_order_lines"."external_lot_code" is null or "production_order_lines"."supply_type" = 'external')
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"output_variant_id" uuid NOT NULL,
	"bom_id" uuid,
	"partner_id" uuid,
	"location_id" uuid NOT NULL,
	"quantity_planned" numeric(18, 4) NOT NULL,
	"quantity_produced" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_quantity_planned_positive_check" CHECK ("production_orders"."quantity_planned" > 0),
	CONSTRAINT "production_orders_quantity_produced_not_negative_check" CHECK ("production_orders"."quantity_produced" >= 0),
	CONSTRAINT "production_orders_status_check" CHECK ("production_orders"."status" in ('draft', 'released', 'completed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_output_variant_id_product_variants_id_fk" FOREIGN KEY ("output_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boms" ADD CONSTRAINT "boms_licence_id_product_licences_id_fk" FOREIGN KEY ("licence_id") REFERENCES "public"."product_licences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_licences" ADD CONSTRAINT "product_licences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_lines" ADD CONSTRAINT "production_order_lines_component_variant_id_product_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_output_variant_id_product_variants_id_fk" FOREIGN KEY ("output_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_id_boms_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."boms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_lines_bom_component_key" ON "bom_lines" USING btree ("bom_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "bom_lines_org_component_idx" ON "bom_lines" USING btree ("organization_id","component_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boms_org_output_version_key" ON "boms" USING btree ("organization_id","output_variant_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "boms_one_active_per_output_key" ON "boms" USING btree ("organization_id","output_variant_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "boms_organization_id_idx" ON "boms" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_licences_org_authority_number_key" ON "product_licences" USING btree ("organization_id","authority","number");--> statement-breakpoint
CREATE INDEX "product_licences_organization_id_idx" ON "product_licences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_lines_order_component_key" ON "production_order_lines" USING btree ("production_order_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "production_order_lines_org_component_idx" ON "production_order_lines" USING btree ("organization_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "production_orders_org_status_idx" ON "production_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "production_orders_org_output_idx" ON "production_orders" USING btree ("organization_id","output_variant_id");--> statement-breakpoint
CREATE INDEX "production_orders_org_id_idx" ON "production_orders" USING btree ("organization_id","id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_partner_id_idx" ON "locations" USING btree ("partner_id") WHERE "locations"."partner_id" is not null;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_partner_is_site_check" CHECK ("locations"."partner_id" is null or "locations"."type" = 'site');
--> statement-breakpoint
CREATE TRIGGER product_licences_set_updated_at BEFORE UPDATE ON product_licences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER boms_set_updated_at BEFORE UPDATE ON boms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER bom_lines_set_updated_at BEFORE UPDATE ON bom_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER production_orders_set_updated_at BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER production_order_lines_set_updated_at BEFORE UPDATE ON production_order_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();