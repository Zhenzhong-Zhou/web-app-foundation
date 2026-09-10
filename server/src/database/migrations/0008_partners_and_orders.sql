CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"quantity_ordered" numeric(18, 4) NOT NULL,
	"quantity_fulfilled" numeric(18, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_quantity_ordered_positive_check" CHECK ("order_lines"."quantity_ordered" > 0),
	CONSTRAINT "order_lines_fulfilled_within_ordered_check" CHECK ("order_lines"."quantity_fulfilled" >= 0 and "order_lines"."quantity_fulfilled" <= "order_lines"."quantity_ordered")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"reference" text,
	"expected_at" timestamp with time zone,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_direction_check" CHECK ("orders"."direction" in ('purchase', 'sale')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('draft', 'confirmed', 'received', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"tax_id" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partners_name_not_blank_check" CHECK (length(btrim("partners"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_variant_key" ON "order_lines" USING btree ("order_id","variant_id");--> statement-breakpoint
CREATE INDEX "order_lines_org_variant_idx" ON "order_lines" USING btree ("organization_id","variant_id");--> statement-breakpoint
CREATE INDEX "orders_org_status_idx" ON "orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "orders_org_partner_idx" ON "orders" USING btree ("organization_id","partner_id");--> statement-breakpoint
CREATE INDEX "orders_org_created_at_idx" ON "orders" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "partners_org_code_key" ON "partners" USING btree ("organization_id","code") WHERE "partners"."code" is not null;--> statement-breakpoint
CREATE INDEX "partners_org_name_idx" ON "partners" USING btree ("organization_id","name");