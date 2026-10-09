ALTER TABLE "product_licences" ADD COLUMN "expiry_notice_for" date;--> statement-breakpoint
ALTER TABLE "product_licences" ADD COLUMN "expiry_notice_days" integer;--> statement-breakpoint
CREATE INDEX "product_licences_expires_at_idx" ON "product_licences" USING btree ("expires_at");