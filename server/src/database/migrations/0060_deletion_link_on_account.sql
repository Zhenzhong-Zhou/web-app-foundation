ALTER TABLE "organizations" DROP CONSTRAINT "organizations_deletion_with_account_of_users_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_with_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deletion_with_organization_id_organizations_id_fk" FOREIGN KEY ("deletion_with_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_deletion_with_organization_id_idx" ON "users" USING btree ("deletion_with_organization_id") WHERE "users"."deletion_with_organization_id" is not null;--> statement-breakpoint
ALTER TABLE "organizations" DROP COLUMN "deletion_with_account_of";