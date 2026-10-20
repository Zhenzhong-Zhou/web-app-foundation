CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"note" text,
	"invited_by" uuid NOT NULL,
	"link" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"membership_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_link_check" CHECK ("invitations"."link" in ('emailed', 'copied', 'not_sent')),
	CONSTRAINT "invitations_accepted_check" CHECK (("invitations"."accepted_at" is null) = ("invitations"."membership_id" is null) and ("invitations"."accepted_at" is null or "invitations"."revoked_at" is null))
);
--> statement-breakpoint
ALTER TABLE "account_events" DROP CONSTRAINT "account_events_action_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_key" ON "invitations" USING btree ("organization_id",lower("email")) WHERE "invitations"."accepted_at" is null and "invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_organization_id_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_membership_id_idx" ON "invitations" USING btree ("membership_id");--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_invitation_id_idx" ON "auth_tokens" USING btree ("invitation_id");--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_action_check" CHECK ("account_events"."action" in ('account.registered', 'session.created', 'session.ended', 'session.revoked', 'account.password_changed', 'account.password_reset', 'account.profile_updated', 'account.email_verified', 'account.verification_resent', 'account.deletion_requested', 'account.deletion_cancelled', 'account.left_organization', 'account.invitation_accepted'));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_owner_check" CHECK (num_nonnulls("auth_tokens"."user_id", "auth_tokens"."invitation_id") = 1 and ("auth_tokens"."purpose" = 'invitation') = ("auth_tokens"."invitation_id" is not null));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" IN ('email_verification', 'password_reset', 'invitation'));--> statement-breakpoint
-- Hand-written: updated_at, which drizzle-kit does not model.
CREATE TRIGGER invitations_set_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Hand-written: each system role described by what it lets a person do
-- (ADR-077), where it still holds the line it was provisioned with. The
-- screens and the email read the translated line by the role's name; this
-- keeps the export's roles.csv saying the same.
UPDATE "roles"
SET "description" = CASE "name"
    WHEN 'Owner' THEN 'Everything, including costs, issuing invoices, settings and closing the organization.'
    WHEN 'Admin' THEN 'Day-to-day work: stock, orders, production and drafting invoices. Can add and remove members.'
    ELSE 'Looks at orders, stock and invoices, and changes nothing.'
  END
WHERE "is_system"
  AND ("name", "description") IN (
    ('Owner', 'Full control of the organization'),
    ('Admin', 'Manage members and roles'),
    ('Viewer', 'Read-only access')
  );
