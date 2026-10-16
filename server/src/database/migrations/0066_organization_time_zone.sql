-- Each organization's time zone (ADR-072). Every existing organization
-- starts on UTC, the zone it used until now, so nothing changes until an
-- Owner sets theirs.
ALTER TABLE "organizations" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_time_zone_not_blank_check" CHECK (length(btrim("organizations"."time_zone")) > 0);