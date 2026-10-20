-- Hand-written: users.update leaves the vocabulary. Since a role change
-- needs roles.assign, no route gates it, and another member's details are
-- theirs alone (ADR-063), so it promised what no screen offers
-- (permissions.ts, rule 3). Its grants first, then the permission; the
-- seed adds only what PERMISSIONS lists, so it does not come back.
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "key" = 'users.update'
);
--> statement-breakpoint
DELETE FROM "permissions" WHERE "key" = 'users.update';
