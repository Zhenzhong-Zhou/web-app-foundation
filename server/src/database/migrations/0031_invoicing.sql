CREATE TABLE "credit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"tax_code_name" text,
	"net_amount" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_lines_quantity_positive_check" CHECK ("credit_note_lines"."quantity" > 0),
	CONSTRAINT "credit_note_lines_amounts_not_negative_check" CHECK ("credit_note_lines"."unit_price" >= 0 and "credit_note_lines"."net_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_note_taxes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"taxable_amount" numeric(18, 4) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_taxes_rate_range_check" CHECK ("credit_note_taxes"."rate" >= 0 and "credit_note_taxes"."rate" <= 100),
	CONSTRAINT "credit_note_taxes_amounts_not_negative_check" CHECK ("credit_note_taxes"."taxable_amount" >= 0 and "credit_note_taxes"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"number" text NOT NULL,
	"currency" char(3) NOT NULL,
	"credit_date" date NOT NULL,
	"reason" text NOT NULL,
	"is_void" boolean DEFAULT false NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"tax_total" numeric(18, 4) NOT NULL,
	"total" numeric(18, 4) NOT NULL,
	"seller_name" text,
	"seller_tax_number" text,
	"seller_line1" text,
	"seller_line2" text,
	"seller_city" text,
	"seller_region" text,
	"seller_postal_code" text,
	"seller_country" char(2),
	"bill_to_address_id" uuid,
	"bill_to_name" text,
	"bill_to_line1" text,
	"bill_to_line2" text,
	"bill_to_city" text,
	"bill_to_region" text,
	"bill_to_postal_code" text,
	"bill_to_country" char(2),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_currency_format_check" CHECK ("credit_notes"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "credit_notes_reason_not_blank_check" CHECK (length(btrim("credit_notes"."reason")) > 0),
	CONSTRAINT "credit_notes_total_check" CHECK ("credit_notes"."total" = "credit_notes"."subtotal" + "credit_notes"."tax_total"),
	CONSTRAINT "credit_notes_amounts_not_negative_check" CHECK ("credit_notes"."subtotal" >= 0 and "credit_notes"."tax_total" >= 0),
	CONSTRAINT "credit_notes_parties_check" CHECK ("credit_notes"."seller_name" is not null and "credit_notes"."seller_line1" is not null and "credit_notes"."seller_country" is not null
          and "credit_notes"."bill_to_name" is not null and "credit_notes"."bill_to_line1" is not null and "credit_notes"."bill_to_country" is not null)
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"organization_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"next_value" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "document_sequences_pkey" PRIMARY KEY("organization_id","document_type"),
	CONSTRAINT "document_sequences_document_type_check" CHECK ("document_sequences"."document_type" in ('invoice', 'credit_note')),
	CONSTRAINT "document_sequences_next_value_check" CHECK ("document_sequences"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit_price" numeric(18, 4) NOT NULL,
	"tax_code_id" uuid,
	"tax_code_name" text,
	"net_amount" numeric(18, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_lines_quantity_positive_check" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_unit_price_not_negative_check" CHECK ("invoice_lines"."unit_price" >= 0),
	CONSTRAINT "invoice_lines_net_amount_not_negative_check" CHECK ("invoice_lines"."net_amount" is null or "invoice_lines"."net_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_taxes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"taxable_amount" numeric(18, 4) NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_taxes_rate_range_check" CHECK ("invoice_taxes"."rate" >= 0 and "invoice_taxes"."rate" <= 100),
	CONSTRAINT "invoice_taxes_amounts_not_negative_check" CHECK ("invoice_taxes"."taxable_amount" >= 0 and "invoice_taxes"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"number" text,
	"currency" char(3) NOT NULL,
	"invoice_date" date,
	"due_date" date,
	"note" text,
	"subtotal" numeric(18, 4),
	"tax_total" numeric(18, 4),
	"total" numeric(18, 4),
	"seller_name" text,
	"seller_tax_number" text,
	"seller_line1" text,
	"seller_line2" text,
	"seller_city" text,
	"seller_region" text,
	"seller_postal_code" text,
	"seller_country" char(2),
	"bill_to_address_id" uuid,
	"bill_to_name" text,
	"bill_to_line1" text,
	"bill_to_line2" text,
	"bill_to_city" text,
	"bill_to_region" text,
	"bill_to_postal_code" text,
	"bill_to_country" char(2),
	"ship_to_label" text,
	"ship_to_line1" text,
	"ship_to_line2" text,
	"ship_to_city" text,
	"ship_to_region" text,
	"ship_to_postal_code" text,
	"ship_to_country" char(2),
	"created_by" uuid NOT NULL,
	"issued_at" timestamp with time zone,
	"issued_by" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('draft', 'issued', 'voided')),
	CONSTRAINT "invoices_currency_format_check" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_draft_shape_check" CHECK ("invoices"."status" <> 'draft' or (
            "invoices"."number" is null and "invoices"."issued_at" is null and "invoices"."issued_by" is null
            and "invoices"."subtotal" is null and "invoices"."tax_total" is null and "invoices"."total" is null
          )),
	CONSTRAINT "invoices_issued_shape_check" CHECK ("invoices"."status" = 'draft' or (
            "invoices"."number" is not null and "invoices"."invoice_date" is not null
            and "invoices"."issued_at" is not null and "invoices"."issued_by" is not null
            and "invoices"."subtotal" is not null and "invoices"."tax_total" is not null and "invoices"."total" is not null
            and "invoices"."seller_name" is not null and "invoices"."seller_line1" is not null and "invoices"."seller_country" is not null
            and "invoices"."bill_to_name" is not null and "invoices"."bill_to_line1" is not null and "invoices"."bill_to_country" is not null
          )),
	CONSTRAINT "invoices_void_shape_check" CHECK (("invoices"."status" = 'voided') = ("invoices"."voided_at" is not null)
          and ("invoices"."voided_at" is null) = ("invoices"."voided_by" is null)
          and ("invoices"."voided_at" is null) = ("invoices"."void_reason" is null)),
	CONSTRAINT "invoices_total_check" CHECK ("invoices"."total" is null or "invoices"."total" = "invoices"."subtotal" + "invoices"."tax_total"),
	CONSTRAINT "invoices_amounts_not_negative_check" CHECK (coalesce("invoices"."subtotal", 0) >= 0 and coalesce("invoices"."tax_total", 0) >= 0),
	CONSTRAINT "invoices_due_after_issue_check" CHECK ("invoices"."due_date" is null or "invoices"."invoice_date" is null or "invoices"."due_date" >= "invoices"."invoice_date"),
	CONSTRAINT "invoices_ship_to_snapshot_check" CHECK (("invoices"."ship_to_line1" is null) = ("invoices"."ship_to_country" is null)),
	CONSTRAINT "invoices_countries_format_check" CHECK (("invoices"."seller_country" is null or "invoices"."seller_country" ~ '^[A-Z]{2}$')
          and ("invoices"."bill_to_country" is null or "invoices"."bill_to_country" ~ '^[A-Z]{2}$')
          and ("invoices"."ship_to_country" is null or "invoices"."ship_to_country" ~ '^[A-Z]{2}$'))
);
--> statement-breakpoint
CREATE TABLE "tax_code_components" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tax_code_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_code_components_name_not_blank_check" CHECK (length(btrim("tax_code_components"."name")) > 0),
	CONSTRAINT "tax_code_components_rate_range_check" CHECK ("tax_code_components"."rate" >= 0 and "tax_code_components"."rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_name_not_blank_check" CHECK (length(btrim("tax_codes"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "addresses" DROP CONSTRAINT "addresses_one_owner_check";--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "owner_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "tax_registration_number" text;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_taxes" ADD CONSTRAINT "credit_note_taxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_taxes" ADD CONSTRAINT "credit_note_taxes_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_bill_to_address_id_addresses_id_fk" FOREIGN KEY ("bill_to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_taxes" ADD CONSTRAINT "invoice_taxes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bill_to_address_id_addresses_id_fk" FOREIGN KEY ("bill_to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_code_components" ADD CONSTRAINT "tax_code_components_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_note_lines_note_invoice_line_key" ON "credit_note_lines" USING btree ("credit_note_id","invoice_line_id");--> statement-breakpoint
CREATE INDEX "credit_note_lines_org_invoice_line_idx" ON "credit_note_lines" USING btree ("organization_id","invoice_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_note_taxes_note_component_key" ON "credit_note_taxes" USING btree ("credit_note_id","name","rate");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_org_number_key" ON "credit_notes" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_invoice_void_key" ON "credit_notes" USING btree ("invoice_id") WHERE "credit_notes"."is_void";--> statement-breakpoint
CREATE INDEX "credit_notes_org_invoice_idx" ON "credit_notes" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE INDEX "credit_notes_org_partner_date_idx" ON "credit_notes" USING btree ("organization_id","partner_id","credit_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_invoice_order_line_key" ON "invoice_lines" USING btree ("invoice_id","order_line_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_org_order_line_idx" ON "invoice_lines" USING btree ("organization_id","order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_taxes_invoice_component_key" ON "invoice_taxes" USING btree ("invoice_id","name","rate");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_key" ON "invoices" USING btree ("organization_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_shipment_standing_key" ON "invoices" USING btree ("shipment_id") WHERE "invoices"."status" <> 'voided';--> statement-breakpoint
CREATE INDEX "invoices_org_partner_date_idx" ON "invoices" USING btree ("organization_id","partner_id","invoice_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invoices_org_status_idx" ON "invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "invoices_org_order_idx" ON "invoices" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_code_components_code_name_key" ON "tax_code_components" USING btree ("tax_code_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_codes_org_name_key" ON "tax_codes" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "addresses_owner_organization_default_key" ON "addresses" USING btree ("owner_organization_id") WHERE "addresses"."is_default" and "addresses"."owner_organization_id" is not null;--> statement-breakpoint
CREATE INDEX "addresses_owner_organization_id_idx" ON "addresses" USING btree ("owner_organization_id");--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_owner_organization_is_tenant_check" CHECK ("addresses"."owner_organization_id" is null or "addresses"."owner_organization_id" = "addresses"."organization_id");--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_one_owner_check" CHECK (num_nonnulls("addresses"."partner_id", "addresses"."location_id", "addresses"."owner_organization_id") = 1);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tax_registration_number_not_blank_check" CHECK ("organizations"."tax_registration_number" is null or length(btrim("organizations"."tax_registration_number")) > 0);
--> statement-breakpoint
CREATE TRIGGER tax_codes_set_updated_at BEFORE UPDATE ON tax_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tax_code_components_set_updated_at BEFORE UPDATE ON tax_code_components
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER invoice_lines_set_updated_at BEFORE UPDATE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();