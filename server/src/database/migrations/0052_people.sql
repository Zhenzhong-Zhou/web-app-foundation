ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "work_phone" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "extension" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_user_id_idx" ON "files" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_check" CHECK (("files"."kind" = 'avatar') = ("files"."user_id" is not null and "files"."organization_id" is null)
        and ("files"."user_id" is null) <> ("files"."organization_id" is null));--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('logo', 'product_image', 'avatar'));