ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders" SET "confirmed_at" = "created_at" WHERE "status" IN ('confirmed', 'fulfilled');