ALTER TABLE "order_lines" ADD COLUMN "unit_price" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "currency" char(3);--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_unit_price_not_negative_check" CHECK ("order_lines"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_currency_format_check" CHECK ("order_lines"."currency" is null or "order_lines"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_price_currency_together_check" CHECK (("order_lines"."unit_price" is null) = ("order_lines"."currency" is null));