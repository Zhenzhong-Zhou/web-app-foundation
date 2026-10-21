import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * Roles are per-organization, not global.
 *
 * ADR-003 says every tenant-scoped table carries organization_id NOT NULL, and
 * roles are no exception: seeding creates Owner/Admin/Viewer rows *for each
 * organization*. The cost is a handful of duplicated rows per tenant. The
 * benefit is that an org can rename or customise its own roles later without
 * a schema change and without affecting anyone else.
 *
 * The alternative — global roles with a nullable organization_id — needs a
 * special case in every permission query and breaks the ADR-003 invariant that
 * makes tenant scoping mechanical.
 */
export const roles = pgTable(
  'roles',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the org owns its roles.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    // A made role's line (ADR-080). A built-in role's comes from the
    // catalogues alone, so theirs is null.
    description: text('description'),

    // Seeded roles the UI must not let anyone delete — an org with no Owner
    // is unrecoverable.
    isSystem: boolean('is_system').notNull().default(false),

    ...timestamps,
  },
  (t) => [
    // Unique ignoring case (ADR-080): "warehouse" beside "Warehouse" is
    // the same role to anyone choosing between them.
    uniqueIndex('roles_org_lower_name_key').on(
      t.organizationId,
      sql`lower(${t.name})`,
    ),
    index('roles_organization_id_idx').on(t.organizationId),
    // What membership_roles' and invitation_roles' foreign keys name, so a
    // role is given only in its own organization (ADR-080).
    uniqueIndex('roles_id_org_key').on(t.id, t.organizationId),
  ],
);
