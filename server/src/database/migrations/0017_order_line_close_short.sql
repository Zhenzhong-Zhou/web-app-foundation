ALTER TABLE "order_lines" ADD COLUMN "is_closed_short" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "closed_reason" text;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_closed_reason_check" CHECK ("order_lines"."is_closed_short" = ("order_lines"."closed_reason" is not null));