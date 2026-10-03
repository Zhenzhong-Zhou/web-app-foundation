-- ADR-052: calendar days become `date`. Converted in UTC explicitly: a plain
-- cast reads timestamptz in the session's time zone, which is the dependency
-- this removes. Values written as UTC midnight become the day that was picked;
-- anything else becomes its UTC day, which is what the screens already showed.
ALTER TABLE "lots" ALTER COLUMN "expires_at" SET DATA TYPE date USING ("expires_at" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "expected_at" SET DATA TYPE date USING ("expected_at" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
-- One statement for both, so product_licences_dates_ordered_check is checked
-- once, against two dates.
ALTER TABLE "product_licences" ALTER COLUMN "issued_at" SET DATA TYPE date USING ("issued_at" AT TIME ZONE 'UTC')::date, ALTER COLUMN "expires_at" SET DATA TYPE date USING ("expires_at" AT TIME ZONE 'UTC')::date;
