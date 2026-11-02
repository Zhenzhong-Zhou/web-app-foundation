CREATE TABLE "reorder_points" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reorder_point" numeric(18, 4) NOT NULL,
	"rule" text NOT NULL,
	"fixed_quantity" numeric(18, 4),
	"maximum_quantity" numeric(18, 4),
	"low_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reorder_points_source_check" CHECK ("reorder_points"."source" in ('bought', 'made')),
	CONSTRAINT "reorder_points_rule_check" CHECK ("reorder_points"."rule" in ('just_enough', 'fixed', 'maximum')),
	CONSTRAINT "reorder_points_reorder_point_positive_check" CHECK ("reorder_points"."reorder_point" > 0),
	CONSTRAINT "reorder_points_fixed_quantity_check" CHECK (("reorder_points"."fixed_quantity" is not null) = ("reorder_points"."rule" = 'fixed') and ("reorder_points"."fixed_quantity" is null or "reorder_points"."fixed_quantity" > 0)),
	CONSTRAINT "reorder_points_maximum_quantity_check" CHECK (("reorder_points"."maximum_quantity" is not null) = ("reorder_points"."rule" = 'maximum') and ("reorder_points"."maximum_quantity" is null or "reorder_points"."maximum_quantity" > "reorder_points"."reorder_point"))
);
--> statement-breakpoint
ALTER TABLE "reorder_points" ADD CONSTRAINT "reorder_points_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorder_points" ADD CONSTRAINT "reorder_points_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reorder_points_org_variant_key" ON "reorder_points" USING btree ("organization_id","variant_id");--> statement-breakpoint
-- Hand-written: updated_at, which drizzle-kit does not model.
CREATE TRIGGER reorder_points_set_updated_at BEFORE UPDATE ON reorder_points
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
