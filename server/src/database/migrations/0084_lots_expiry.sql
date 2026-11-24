ALTER TABLE "lots" ADD COLUMN "expiry" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_expiry_check" CHECK ("lots"."expiry" in ('date', 'unknown', 'none'));--> statement-breakpoint
-- Hand-written, before the check that ties expiry to expires_at: a lot
-- with a day reads date, every other none, so nothing reads differently
-- until someone chooses (ADR-094, R8). A lot's updated_at says when someone
-- last changed it; a backfill is not that, so its trigger is off for this
-- one statement, as 0039's is.
ALTER TABLE "lots" DISABLE TRIGGER "lots_set_updated_at";
--> statement-breakpoint
UPDATE "lots" SET "expiry" = 'date' WHERE "expires_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "lots" ENABLE TRIGGER "lots_set_updated_at";
--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_expiry_date_check" CHECK (("lots"."expires_at" is not null) = ("lots"."expiry" = 'date'));
--> statement-breakpoint
-- Hand-written, and temporary (ADR-094, Q5a): the release still serving
-- while the deploy goes on writes expires_at alone, a new lot's day or a
-- day added to a lot or taken from it, and expiry keeps its default or what
-- it was, which the check above would refuse. Before each insert or
-- update, a day present makes the lot date; with no day, unknown and none
-- stay as given, and date becomes none. A write that names both, as this
-- release's do, passes through unchanged. Dropped, with its function, by
-- the first migration of the next branch, once every released write names
-- both.
CREATE FUNCTION lots_expiry_from_date() RETURNS trigger AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    NEW.expiry = 'date';
  ELSIF NEW.expiry = 'date' THEN
    NEW.expiry = 'none';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lots_expiry_from_date BEFORE INSERT OR UPDATE ON lots
  FOR EACH ROW EXECUTE FUNCTION lots_expiry_from_date();
