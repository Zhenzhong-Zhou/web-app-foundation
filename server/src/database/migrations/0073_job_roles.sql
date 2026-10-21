CREATE TABLE "invitation_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invitation_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_role_id_roles_id_fk";
--> statement-breakpoint
DROP INDEX "roles_org_name_key";--> statement-breakpoint
-- Moved by hand ahead of the foreign keys below, which name them: a
-- composite foreign key needs a unique index on the columns it references.
CREATE UNIQUE INDEX "invitations_id_org_key" ON "invitations" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_id_org_key" ON "memberships" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_lower_name_key" ON "roles" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "roles_id_org_key" ON "roles" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_invitation_fk" FOREIGN KEY ("invitation_id","organization_id") REFERENCES "public"."invitations"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_roles" ADD CONSTRAINT "invitation_roles_role_fk" FOREIGN KEY ("role_id","organization_id") REFERENCES "public"."roles"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_fk" FOREIGN KEY ("membership_id","organization_id") REFERENCES "public"."memberships"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_fk" FOREIGN KEY ("role_id","organization_id") REFERENCES "public"."roles"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_roles_invitation_role_key" ON "invitation_roles" USING btree ("invitation_id","role_id");--> statement-breakpoint
CREATE INDEX "invitation_roles_organization_id_idx" ON "invitation_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_roles_role_id_idx" ON "invitation_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_roles_membership_role_key" ON "membership_roles" USING btree ("membership_id","role_id");--> statement-breakpoint
CREATE INDEX "membership_roles_organization_id_idx" ON "membership_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles" USING btree ("role_id");--> statement-breakpoint
-- Hand-written, ahead of the columns' drop below: every member holds the
-- one role they held, and every invitation names the one it granted
-- (ADR-080). The foreign keys above check each row, so a role_id that
-- named another organization's role would fail here rather than carry
-- over.
INSERT INTO "membership_roles" ("organization_id", "membership_id", "role_id")
SELECT "organization_id", "id", "role_id" FROM "memberships";
--> statement-breakpoint
INSERT INTO "invitation_roles" ("organization_id", "invitation_id", "role_id")
SELECT "organization_id", "id", "role_id" FROM "invitations";
--> statement-breakpoint
-- Hand-written: a built-in role's line comes from the catalogues alone
-- (ADR-080), so the English 0068 and 0072 kept here goes; the column
-- holds made roles' lines.
UPDATE "roles" SET "description" = NULL WHERE "is_system";
--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN "role_id";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN "role_id";
