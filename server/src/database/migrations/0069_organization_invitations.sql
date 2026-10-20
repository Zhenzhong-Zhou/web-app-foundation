CREATE TABLE "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"organization_name" text NOT NULL,
	"locale" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"started_organization_id" uuid,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitations_accepted_check" CHECK (("organization_invitations"."accepted_at" is null) = ("organization_invitations"."started_organization_id" is null) and ("organization_invitations"."accepted_at" is null or "organization_invitations"."revoked_at" is null))
);
--> statement-breakpoint
ALTER TABLE "account_events" DROP CONSTRAINT "account_events_action_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_owner_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "organization_invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "organization_invitations_started_organization_id_organizations_id_fk" FOREIGN KEY ("started_organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_invitations_waiting_email_key" ON "organization_invitations" USING btree (lower("email")) WHERE "organization_invitations"."accepted_at" is null and "organization_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "organization_invitations_started_organization_id_idx" ON "organization_invitations" USING btree ("started_organization_id");--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_organization_invitation_id_organization_invitations_id_fk" FOREIGN KEY ("organization_invitation_id") REFERENCES "public"."organization_invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_organization_invitation_id_idx" ON "auth_tokens" USING btree ("organization_invitation_id");--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_action_check" CHECK ("account_events"."action" in ('account.registered', 'session.created', 'session.ended', 'session.revoked', 'account.password_changed', 'account.password_reset', 'account.profile_updated', 'account.email_verified', 'account.verification_resent', 'account.deletion_requested', 'account.deletion_cancelled', 'account.left_organization', 'account.invitation_accepted', 'account.organization_started'));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_owner_check" CHECK (num_nonnulls("auth_tokens"."user_id", "auth_tokens"."invitation_id", "auth_tokens"."organization_invitation_id") = 1 and ("auth_tokens"."purpose" = 'invitation') = ("auth_tokens"."invitation_id" is not null) and ("auth_tokens"."purpose" = 'organization_invitation') = ("auth_tokens"."organization_invitation_id" is not null));--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose_check" CHECK ("auth_tokens"."purpose" IN ('email_verification', 'password_reset', 'invitation', 'organization_invitation'));--> statement-breakpoint
-- Hand-written: updated_at, which drizzle-kit does not model.
CREATE TRIGGER organization_invitations_set_updated_at BEFORE UPDATE ON organization_invitations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
