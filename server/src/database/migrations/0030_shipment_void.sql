ALTER TABLE "shipments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_void_complete_check" CHECK (("shipments"."voided_at" is null) = ("shipments"."voided_by" is null) and ("shipments"."voided_at" is null) = ("shipments"."void_reason" is null));