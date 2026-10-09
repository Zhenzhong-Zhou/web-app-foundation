import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { roles } from './roles';
import { users } from './users';

/**
 * The join that makes ADR-004 work: a user is not "an Admin", they are an
 * Admin *of an organization*.
 *
 * Every permission check resolves through the membership for the request's
 * current organization — never through the user alone.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: primaryKey(),

    // ADR-012: exists only to serve that user / that org, so both cascade.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // RESTRICT, not CASCADE: deleting a role must not silently strip everyone
    // who held it of their access. Reassign them first.
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),

    /**
     * Their details at work (ADR-063), each optional, each set by the person
     * themself: on the membership, since someone in two organizations has a
     * title and an extension in each.
     */
    jobTitle: text('job_title'),
    department: text('department'),
    location: text('location'),
    workPhone: text('work_phone'),
    extension: text('extension'),

    /**
     * When they last did something here (ADR-063): moved by their own
     * requests at most once a minute, never by a background one. Not a
     * sign-in time, which is the session's.
     */
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // One membership per user per org. Without this, a double-submitted invite
    // gives someone two rows and two roles, and permission checks become
    // order-dependent.
    uniqueIndex('memberships_user_org_key').on(t.userId, t.organizationId),

    // ADR-003 requires an index on organization_id for every tenant-scoped
    // table. user_id is indexed for "which orgs am I in?" on the org switcher.
    index('memberships_organization_id_idx').on(t.organizationId),
    index('memberships_user_id_idx').on(t.userId),
  ],
);
