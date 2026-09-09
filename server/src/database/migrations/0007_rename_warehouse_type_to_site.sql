ALTER TABLE "locations" DROP CONSTRAINT "locations_type_check";--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_type_check" CHECK ("locations"."type" in ('site', 'zone', 'aisle', 'shelf', 'bin'));
