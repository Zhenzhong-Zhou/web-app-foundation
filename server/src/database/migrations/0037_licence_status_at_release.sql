ALTER TABLE "organizations" ADD COLUMN "licence_not_in_force_policy" text DEFAULT 'block' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "licence_expired_policy" text DEFAULT 'override' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "licence_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "licence_status_at_release" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "licence_overridden_by" uuid;--> statement-breakpoint
ALTER TABLE "production_orders" ADD COLUMN "licence_override_reason" text;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_overridden_by_users_id_fk" FOREIGN KEY ("licence_overridden_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_licence_not_in_force_policy_check" CHECK ("organizations"."licence_not_in_force_policy" in ('block', 'override', 'allow'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_licence_expired_policy_check" CHECK ("organizations"."licence_expired_policy" in ('block', 'override', 'allow'));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_status_at_release_check" CHECK ("production_orders"."licence_status_at_release" is null or "production_orders"."licence_status_at_release" in ('current', 'expired', 'not_in_force', 'none'));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_status_after_release_check" CHECK ("production_orders"."status" <> 'draft' or "production_orders"."licence_status_at_release" is null);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_override_complete_check" CHECK (("production_orders"."licence_overridden_by" is null) = ("production_orders"."licence_override_reason" is null));--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_licence_override_status_check" CHECK ("production_orders"."licence_overridden_by" is null or "production_orders"."licence_status_at_release" in ('expired', 'not_in_force'));