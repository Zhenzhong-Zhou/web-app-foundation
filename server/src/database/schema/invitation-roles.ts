import {
  foreignKey,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { invitations } from './invitations';
import { organizations } from './organizations';
import { roles } from './roles';

/**
 * The roles an invitation names (ADR-080), which accepting it gives: as
 * membership_roles is for a member, and read and written, like it, only in
 * core/authorization.
 */
export const invitationRoles = pgTable(
  'invitation_roles',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invitationId: uuid('invitation_id').notNull(),
    roleId: uuid('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Held to the row's organization, as a member's roles are; the rows go
    // with their invitation, accepted, swept or with the organization.
    foreignKey({
      name: 'invitation_roles_invitation_fk',
      columns: [t.invitationId, t.organizationId],
      foreignColumns: [invitations.id, invitations.organizationId],
    }).onDelete('cascade'),
    // RESTRICT, as invitations.role_id was: deleting a role must not
    // quietly change what an invitation grants.
    foreignKey({
      name: 'invitation_roles_role_fk',
      columns: [t.roleId, t.organizationId],
      foreignColumns: [roles.id, roles.organizationId],
    }).onDelete('restrict'),
    uniqueIndex('invitation_roles_invitation_role_key').on(
      t.invitationId,
      t.roleId,
    ),
    index('invitation_roles_organization_id_idx').on(t.organizationId),
    index('invitation_roles_role_id_idx').on(t.roleId),
  ],
);
