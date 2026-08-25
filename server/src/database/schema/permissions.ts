import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';

/**
 * The permission vocabulary — deliberately **global**, with no organization_id.
 *
 * This is not a violation of ADR-003. Permissions are not tenant data: each key
 * exists because application code checks for it. An organization cannot invent
 * `reports.export` and have it mean anything, because nothing reads it.
 *
 * Contrast with `roles`, which *are* per-org: an org can rename Viewer or add a
 * custom role, because a role is just a named bundle of these keys.
 */
export const permissions = pgTable(
  'permissions',
  {
    id: primaryKey(),

    // `resource.action` — see docs/conventions.md.
    key: text('key').notNull(),
    description: text('description'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('permissions_key_key').on(t.key),

    // Enforces the naming convention in the database, so a seed typo like
    // `users_create` or `Users.Create` is rejected rather than silently
    // becoming a permission no guard will ever match.
    check(
      'permissions_key_format',
      sql`${t.key} ~ '^[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)*$'`,
    ),
  ],
);
