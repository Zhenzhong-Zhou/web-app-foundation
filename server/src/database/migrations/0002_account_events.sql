CREATE TABLE "account_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_events_action_check" CHECK ("account_events"."action" in ('session.created', 'session.ended', 'session.revoked', 'account.password_changed', 'account.password_reset', 'account.profile_updated', 'account.email_verified'))
);
--> statement-breakpoint
ALTER TABLE "account_events" ADD CONSTRAINT "account_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_events_user_id_id_idx" ON "account_events" USING btree ("user_id","id");