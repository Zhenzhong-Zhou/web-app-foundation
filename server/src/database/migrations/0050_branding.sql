ALTER TABLE "organizations" ADD COLUMN "logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "rail" text DEFAULT 'dark' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_on_documents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "expiry_warning_days" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "expiry_critical_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_accent_color_format_check" CHECK ("organizations"."accent_color" is null or "organizations"."accent_color" ~ '^#[0-9A-F]{6}$');--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_rail_check" CHECK ("organizations"."rail" in ('dark', 'light'));--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_expiry_days_check" CHECK ("organizations"."expiry_critical_days" between 1 and 365 and "organizations"."expiry_warning_days" between 1 and 365 and "organizations"."expiry_critical_days" < "organizations"."expiry_warning_days");