CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_list_items_unit_price_not_negative_check" CHECK ("price_list_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"currency" char(3) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_direction_check" CHECK ("price_lists"."direction" in ('sale', 'purchase')),
	CONSTRAINT "price_lists_currency_format_check" CHECK ("price_lists"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "price_lists_name_not_blank_check" CHECK (btrim("price_lists"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "price_source" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_sale_price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "sale_price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "purchase_price_list_id" uuid;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_list_variant_key" ON "price_list_items" USING btree ("price_list_id","variant_id");--> statement-breakpoint
CREATE INDEX "price_list_items_org_variant_idx" ON "price_list_items" USING btree ("organization_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_org_name_key" ON "price_lists" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "price_lists_org_direction_idx" ON "price_lists" USING btree ("organization_id","direction");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_sale_price_list_id_price_lists_id_fk" FOREIGN KEY ("default_sale_price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_sale_price_list_id_price_lists_id_fk" FOREIGN KEY ("sale_price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_purchase_price_list_id_price_lists_id_fk" FOREIGN KEY ("purchase_price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_price_source_check" CHECK ("order_lines"."price_source" is null or "order_lines"."price_source" in ('list', 'manual'));--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_price_list_shape_check" CHECK (coalesce("order_lines"."price_source" = 'list', false) = ("order_lines"."price_list_id" is not null));
--> statement-breakpoint
-- Hand-written: drizzle-kit does not model triggers (see columns.ts).
CREATE TRIGGER price_lists_set_updated_at BEFORE UPDATE ON price_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER price_list_items_set_updated_at BEFORE UPDATE ON price_list_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Hand-written: every price that exists today was typed (ADR-049).
UPDATE order_lines SET price_source = 'manual' WHERE unit_price IS NOT NULL;