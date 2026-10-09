CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_type" text NOT NULL,
	"sizes" jsonb NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"original_name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('logo', 'product_image'))
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_org_created_at_idx" ON "files" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "files_created_by_idx" ON "files" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "files_unattached_idx" ON "files" USING btree ("created_at") WHERE "files"."attached_at" is null and "files"."released_at" is null;--> statement-breakpoint
CREATE INDEX "files_released_at_idx" ON "files" USING btree ("released_at") WHERE "files"."released_at" is not null;