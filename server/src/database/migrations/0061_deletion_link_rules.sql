ALTER TABLE "users" ADD CONSTRAINT "users_deletion_with_organization_check" CHECK ("users"."deletion_with_organization_id" is null or "users"."deletion_scheduled_at" is not null);--> statement-breakpoint
-- Hand-written (drizzle-kit does not model triggers): an account goes with
-- an organization only while it is a member there (ADR-070, amended). Ending
-- the membership, by leaving, by an Owner's removal, or by any path added
-- later, lets go of the organization; the account's own deletion stands, on
-- its own day.
CREATE FUNCTION release_deletion_link() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
     SET deletion_with_organization_id = NULL
   WHERE id = OLD.user_id
     AND deletion_with_organization_id = OLD.organization_id;
  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER memberships_release_deletion_link
  AFTER DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION release_deletion_link();
