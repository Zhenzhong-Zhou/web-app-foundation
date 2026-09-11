CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"partner_id" uuid,
	"location_id" uuid,
	"label" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" char(2) NOT NULL,
	"is_billing" boolean DEFAULT false NOT NULL,
	"is_shipping" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_one_owner_check" CHECK (num_nonnulls("addresses"."partner_id", "addresses"."location_id") = 1),
	CONSTRAINT "addresses_line1_not_blank_check" CHECK (length(btrim("addresses"."line1")) > 0),
	CONSTRAINT "addresses_country_format_check" CHECK ("addresses"."country" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"partner_id" uuid,
	"location_id" uuid,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_one_owner_check" CHECK (num_nonnulls("contacts"."partner_id", "contacts"."location_id") = 1),
	CONSTRAINT "contacts_name_not_blank_check" CHECK (length(btrim("contacts"."name")) > 0),
	CONSTRAINT "contacts_reachable_check" CHECK ("contacts"."email" is not null or "contacts"."phone" is not null)
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_partner_default_key" ON "addresses" USING btree ("partner_id") WHERE "addresses"."is_default" and "addresses"."partner_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_location_default_key" ON "addresses" USING btree ("location_id") WHERE "addresses"."is_default" and "addresses"."location_id" is not null;--> statement-breakpoint
CREATE INDEX "addresses_partner_id_idx" ON "addresses" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "addresses_location_id_idx" ON "addresses" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "addresses_organization_id_idx" ON "addresses" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_partner_primary_key" ON "contacts" USING btree ("partner_id") WHERE "contacts"."is_primary" and "contacts"."partner_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_location_primary_key" ON "contacts" USING btree ("location_id") WHERE "contacts"."is_primary" and "contacts"."location_id" is not null;--> statement-breakpoint
CREATE INDEX "contacts_partner_id_idx" ON "contacts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "contacts_location_id_idx" ON "contacts" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "contacts_organization_id_idx" ON "contacts" USING btree ("organization_id");
--> statement-breakpoint
CREATE TRIGGER addresses_set_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER contacts_set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();