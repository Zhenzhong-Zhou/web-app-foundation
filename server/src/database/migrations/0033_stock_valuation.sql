CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"currency" char(3) NOT NULL,
	"rate_date" date NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_rate_positive_check" CHECK ("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_currency_format_check" CHECK ("exchange_rates"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "stock_valuations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"kind" text NOT NULL,
	"movement_id" uuid,
	"quantity" numeric(18, 4) NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"unit_price" numeric(18, 4),
	"currency" char(3),
	"exchange_rate" numeric(18, 8),
	"needs_cost" boolean DEFAULT false NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"note" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_valuations_kind_check" CHECK ("stock_valuations"."kind" in ('movement', 'run_close', 'correction', 'opening')),
	CONSTRAINT "stock_valuations_movement_shape_check" CHECK (("stock_valuations"."movement_id" is not null) = ("stock_valuations"."kind" = 'movement')),
	CONSTRAINT "stock_valuations_quantity_shape_check" CHECK (("stock_valuations"."kind" in ('movement', 'opening')) = ("stock_valuations"."quantity" <> 0)),
	CONSTRAINT "stock_valuations_needs_cost_is_zero_check" CHECK (not "stock_valuations"."needs_cost" or "stock_valuations"."value" = 0),
	CONSTRAINT "stock_valuations_price_currency_together_check" CHECK (("stock_valuations"."unit_price" is null) = ("stock_valuations"."currency" is null)),
	CONSTRAINT "stock_valuations_unit_price_not_negative_check" CHECK ("stock_valuations"."unit_price" is null or "stock_valuations"."unit_price" >= 0),
	CONSTRAINT "stock_valuations_currency_format_check" CHECK ("stock_valuations"."currency" is null or "stock_valuations"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "stock_valuations_exchange_rate_check" CHECK ("stock_valuations"."exchange_rate" is null or ("stock_valuations"."exchange_rate" > 0 and "stock_valuations"."unit_price" is not null)),
	CONSTRAINT "stock_valuations_actor_check" CHECK ("stock_valuations"."actor_id" is not null or "stock_valuations"."kind" = 'opening')
);
--> statement-breakpoint
CREATE TABLE "valuation_pools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(18, 4) DEFAULT '0' NOT NULL,
	"value" numeric(18, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuation_pools_org_variant_lot_key" UNIQUE NULLS NOT DISTINCT("organization_id","variant_id","lot_id"),
	CONSTRAINT "valuation_pools_quantity_non_negative_check" CHECK ("valuation_pools"."quantity" >= 0),
	CONSTRAINT "valuation_pools_empty_has_no_value_check" CHECK ("valuation_pools"."quantity" > 0 or "valuation_pools"."value" = 0)
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "base_currency" char(3);--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_valuations" ADD CONSTRAINT "stock_valuations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_pools" ADD CONSTRAINT "valuation_pools_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_pools" ADD CONSTRAINT "valuation_pools_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_pools" ADD CONSTRAINT "valuation_pools_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_org_currency_date_key" ON "exchange_rates" USING btree ("organization_id","currency","rate_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_valuations_movement_key" ON "stock_valuations" USING btree ("movement_id") WHERE "stock_valuations"."movement_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_valuations_org_pool_created_at_idx" ON "stock_valuations" USING btree ("organization_id","variant_id","lot_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_valuations_org_reference_idx" ON "stock_valuations" USING btree ("organization_id","reference_type","reference_id") WHERE "stock_valuations"."reference_type" is not null;--> statement-breakpoint
CREATE INDEX "stock_valuations_org_needs_cost_idx" ON "stock_valuations" USING btree ("organization_id") WHERE "stock_valuations"."needs_cost";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_base_currency_format_check" CHECK ("organizations"."base_currency" is null or "organizations"."base_currency" ~ '^[A-Z]{3}$');
--> statement-breakpoint
-- Hand-written: drizzle-kit does not model triggers (see columns.ts).
CREATE TRIGGER valuation_pools_set_updated_at BEFORE UPDATE ON valuation_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER exchange_rates_set_updated_at BEFORE UPDATE ON exchange_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Hand-written: the balance valuation starts from (ADR-048). Every pool that
-- holds stock opens at zero and needs a cost, rather than being valued from
-- purchase lines by a guess about which receipt fed which pool.
INSERT INTO valuation_pools (organization_id, variant_id, lot_id, quantity, value)
SELECT organization_id, variant_id, lot_id, sum(quantity), 0
FROM stock_levels
GROUP BY organization_id, variant_id, lot_id
HAVING sum(quantity) > 0;
--> statement-breakpoint
INSERT INTO stock_valuations
  (organization_id, variant_id, lot_id, kind, quantity, value, needs_cost, note)
SELECT organization_id, variant_id, lot_id, 'opening', quantity, 0, true,
       'Stock on hand when valuation began (ADR-048)'
FROM valuation_pools;