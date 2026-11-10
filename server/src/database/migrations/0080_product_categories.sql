CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"name_pinyin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_org_parent_name_key" UNIQUE NULLS NOT DISTINCT("organization_id","parent_id","name"),
	CONSTRAINT "product_categories_no_self_parent_check" CHECK ("product_categories"."id" <> "product_categories"."parent_id")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_product_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_org_category_idx" ON "products" USING btree ("organization_id","category_id");--> statement-breakpoint
-- Hand-written: updated_at, which drizzle-kit does not model.
CREATE TRIGGER product_categories_set_updated_at BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- Hand-written: names in order with a number inside them by its value, so
-- "30 粒" comes before "120 粒" (#305, ADR-092): ICU's root order with
-- numeric ordering (kn). Collations are not modelled by drizzle-kit either.
CREATE COLLATION IF NOT EXISTS numeric_order (provider = icu, locale = 'und-u-kn-true');
