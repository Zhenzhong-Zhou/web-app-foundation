ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "square_logo_file_id" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_square_logo_file_id_files_id_fk" FOREIGN KEY ("square_logo_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_kind_check" CHECK ("files"."kind" in ('logo', 'product_image', 'avatar', 'square_logo'));