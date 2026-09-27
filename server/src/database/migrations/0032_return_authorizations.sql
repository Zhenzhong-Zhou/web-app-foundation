CREATE TABLE "invoice_line_taxes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_taxes_rate_range_check" CHECK ("invoice_line_taxes"."rate" >= 0 and "invoice_line_taxes"."rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "return_authorization_lines" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"return_authorization_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"resolution" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_authorization_lines_quantity_positive_check" CHECK ("return_authorization_lines"."quantity" > 0),
	CONSTRAINT "return_authorization_lines_resolution_check" CHECK ("return_authorization_lines"."resolution" in ('credit', 'replace', 'none'))
);
--> statement-breakpoint
CREATE TABLE "return_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" text NOT NULL,
	"order_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"invoice_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"expects_goods" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_authorizations_status_check" CHECK ("return_authorizations"."status" in ('open', 'closed', 'cancelled')),
	CONSTRAINT "return_authorizations_reason_not_blank_check" CHECK (length(btrim("return_authorizations"."reason")) > 0),
	CONSTRAINT "return_authorizations_closed_shape_check" CHECK (("return_authorizations"."status" = 'closed') = ("return_authorizations"."closed_at" is not null)
          and ("return_authorizations"."closed_at" is null) = ("return_authorizations"."closed_by" is null)),
	CONSTRAINT "return_authorizations_cancelled_shape_check" CHECK (("return_authorizations"."status" = 'cancelled') = ("return_authorizations"."cancelled_at" is not null)
          and ("return_authorizations"."cancelled_at" is null) = ("return_authorizations"."cancelled_by" is null))
);
--> statement-breakpoint
ALTER TABLE "document_sequences" DROP CONSTRAINT "document_sequences_document_type_check";--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD COLUMN "return_authorization_line_id" uuid;--> statement-breakpoint
ALTER TABLE "order_returns" ADD COLUMN "return_authorization_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "return_authorization_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_taxes" ADD CONSTRAINT "invoice_line_taxes_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorization_lines" ADD CONSTRAINT "return_authorization_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorization_lines" ADD CONSTRAINT "return_authorization_lines_return_authorization_id_return_authorizations_id_fk" FOREIGN KEY ("return_authorization_id") REFERENCES "public"."return_authorizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorization_lines" ADD CONSTRAINT "return_authorization_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorization_lines" ADD CONSTRAINT "return_authorization_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_line_taxes_line_component_key" ON "invoice_line_taxes" USING btree ("invoice_line_id","name","rate");--> statement-breakpoint
CREATE UNIQUE INDEX "return_authorization_lines_rma_order_line_key" ON "return_authorization_lines" USING btree ("return_authorization_id","order_line_id");--> statement-breakpoint
CREATE INDEX "return_authorization_lines_org_order_line_idx" ON "return_authorization_lines" USING btree ("organization_id","order_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_authorizations_org_number_key" ON "return_authorizations" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "return_authorizations_org_order_idx" ON "return_authorizations" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE INDEX "return_authorizations_org_status_idx" ON "return_authorizations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "return_authorizations_org_partner_idx" ON "return_authorizations" USING btree ("organization_id","partner_id");--> statement-breakpoint
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_return_authorization_line_id_return_authorization_lines_id_fk" FOREIGN KEY ("return_authorization_line_id") REFERENCES "public"."return_authorization_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_return_authorization_id_return_authorizations_id_fk" FOREIGN KEY ("return_authorization_id") REFERENCES "public"."return_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_return_authorization_id_return_authorizations_id_fk" FOREIGN KEY ("return_authorization_id") REFERENCES "public"."return_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_note_lines_return_authorization_line_idx" ON "credit_note_lines" USING btree ("return_authorization_line_id") WHERE "credit_note_lines"."return_authorization_line_id" is not null;--> statement-breakpoint
CREATE INDEX "order_returns_return_authorization_idx" ON "order_returns" USING btree ("return_authorization_id") WHERE "order_returns"."return_authorization_id" is not null;--> statement-breakpoint
CREATE INDEX "orders_return_authorization_id_idx" ON "orders" USING btree ("return_authorization_id") WHERE "orders"."return_authorization_id" is not null;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_document_type_check" CHECK ("document_sequences"."document_type" in ('invoice', 'credit_note', 'return_authorization'));
--> statement-breakpoint
CREATE TRIGGER return_authorizations_set_updated_at BEFORE UPDATE ON return_authorizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Per-line tax components for invoices issued before issuing recorded them
-- (ADR-047). Read from each line's code as it stands now: correct only
-- because no rate has changed since those invoices were issued, and there
-- are none in production.
INSERT INTO invoice_line_taxes (organization_id, invoice_line_id, name, rate)
SELECT il.organization_id, il.id, c.name, c.rate
FROM invoice_lines il
JOIN invoices i ON i.id = il.invoice_id AND i.status <> 'draft'
JOIN tax_code_components c ON c.tax_code_id = il.tax_code_id;