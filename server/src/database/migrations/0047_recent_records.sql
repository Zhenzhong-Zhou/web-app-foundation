CREATE TABLE "recent_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_records_kind_check" CHECK ("recent_records"."kind" in ('order', 'invoice', 'lot', 'product', 'partner', 'run', 'return', 'priceList'))
);
--> statement-breakpoint
ALTER TABLE "recent_records" ADD CONSTRAINT "recent_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_records" ADD CONSTRAINT "recent_records_membership_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "public"."memberships"("user_id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recent_records_person_record_key" ON "recent_records" USING btree ("organization_id","user_id","kind","record_id");--> statement-breakpoint
CREATE INDEX "recent_records_person_opened_idx" ON "recent_records" USING btree ("organization_id","user_id","opened_at" DESC NULLS LAST);