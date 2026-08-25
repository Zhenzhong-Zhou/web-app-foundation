import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';

/**
 * The tenant root (ADR-003). Every tenant-scoped table points here.
 *
 * Deliberately has no created_by: organizations and users would then
 * reference each other, and the Owner membership already records who
 * created it.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryKey(),
    name: text('name').notNull(),
    // URL-safe identifier: /orgs/acme rather than /orgs/<uuid>
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('organizations_slug_key').on(t.slug),
    check(
      'organizations_slug_format',
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
  ],
);
