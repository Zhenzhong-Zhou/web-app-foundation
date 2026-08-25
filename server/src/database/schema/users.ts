import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';

/**
 * Global identity. **No organization_id** — a user is not owned by an org
 * (ADR-004). Org membership and role live in `memberships`.
 *
 * Users are never hard-deleted (ADR-012): deletion anonymises the row so
 * audit_log.actor_id keeps pointing at a valid tombstone.
 */
export const users = pgTable(
  'users',
  {
    id: primaryKey(),
    email: text('email').notNull(),
    // Nullable: cleared on anonymisation, and absent for future SSO-only users.
    passwordHash: text('password_hash'),
    name: text('name').notNull(),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),

    // ADR-012 deletion flow: request sets deletion_scheduled_at, a 30-day
    // grace window follows, then deleted_at is set and the row anonymised.
    deletionScheduledAt: timestamp('deletion_scheduled_at', {
      withTimezone: true,
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // Case-insensitive uniqueness enforced in the database, not by remembering
    // to lowercase before every insert. Bob@x.com and bob@x.com collide.
    //
    // A plain unique constraint is correct despite soft deletes: ADR-012
    // anonymises the address to deleted-<uuid>@invalid, which frees the
    // original for re-registration.
    uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`),
  ],
);
