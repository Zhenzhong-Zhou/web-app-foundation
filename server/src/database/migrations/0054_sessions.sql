ALTER TABLE "organizations" ADD COLUMN "idle_sign_out_minutes" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "idle_sign_out_scope" text DEFAULT 'unticked' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "keep_signed_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_idle_sign_out_minutes_check" CHECK ("organizations"."idle_sign_out_minutes" is null or "organizations"."idle_sign_out_minutes" in (15, 30, 60, 240));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_idle_sign_out_scope_check" CHECK ("organizations"."idle_sign_out_scope" in ('unticked', 'everyone'));