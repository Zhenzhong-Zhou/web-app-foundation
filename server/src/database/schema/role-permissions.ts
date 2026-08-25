import {
  index,
  pgTable,
  primaryKey as compositeKey,
  uuid,
} from 'drizzle-orm/pg-core';

import { permissions } from './permissions';
import { roles } from './roles';

/**
 * Which permissions each role grants (ADR-004).
 *
 * A pure join table, so the composite key *is* the identity — a surrogate uuid
 * would add a column and an index while permitting duplicate (role, permission)
 * pairs unless separately constrained.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    compositeKey({ columns: [t.roleId, t.permissionId] }),
    // The composite PK indexes (role_id, permission_id) left-to-right, so
    // "which roles grant this permission?" needs its own index.
    index('role_permissions_permission_id_idx').on(t.permissionId),
  ],
);
