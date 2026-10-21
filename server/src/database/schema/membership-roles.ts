import {
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { memberships } from './memberships';
import { organizations } from './organizations';
import { roles } from './roles';

/**
 * The roles a member holds (ADR-080): one or more, added together, each a
 * row of its own with its own id, so that a scope or an end date can later
 * be a column here. Never updated, only given and taken away, so no
 * updated_at.
 *
 * Read and written only in core/authorization, the one place that decides
 * what a member may do; a lint rule refuses it anywhere else.
 */
export const membershipRoles = pgTable(
  'membership_roles',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id').notNull(),
    roleId: uuid('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The membership and the role each held to the row's organization, so
    // a role from another organization cannot be given, whatever the code
    // above it does. Removing a member removes their rows.
    foreignKey({
      name: 'membership_roles_membership_fk',
      columns: [t.membershipId, t.organizationId],
      foreignColumns: [memberships.id, memberships.organizationId],
    }).onDelete('cascade'),
    // RESTRICT, as memberships.role_id was: deleting a role must not
    // silently strip everyone who holds it of their access.
    foreignKey({
      name: 'membership_roles_role_fk',
      columns: [t.roleId, t.organizationId],
      foreignColumns: [roles.id, roles.organizationId],
    }).onDelete('restrict'),
    // A role held once. Its leading column is how a member's roles are
    // found, on every request, so it is the membership's index too.
    uniqueIndex('membership_roles_membership_role_key').on(
      t.membershipId,
      t.roleId,
    ),
    index('membership_roles_organization_id_idx').on(t.organizationId),
    // Who holds a role: its holders, and whether it may be deleted.
    index('membership_roles_role_id_idx').on(t.roleId),
  ],
);
