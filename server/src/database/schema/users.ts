import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Locale } from '../../common/locales';
import { primaryKey, timestamps } from './columns';
import { files } from './files';
import { organizations } from './organizations';

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

    /**
     * The language the app speaks to this person (ADR-054): screens,
     * refusals, their emails and notifications. A BCP 47 tag from
     * SUPPORTED_LOCALES, checked by the DTOs. Null follows the browser, and
     * where there is no browser to ask, the request that caused the email,
     * else English.
     */
    locale: text('locale').$type<Locale>(),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    /**
     * Their photo (ADR-063): a file of kind avatar, theirs, set and removed
     * only by them. Null shows their initials.
     */
    photoFileId: uuid('photo_file_id').references((): AnyPgColumn => files.id, {
      onDelete: 'set null',
    }),

    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),

    // ADR-012 deletion flow: request sets deletion_scheduled_at, a 30-day
    // grace window follows, then deleted_at is set and the row anonymised.
    // The deletion day, a calendar day (ADR-052), completed once it has
    // ended in every time zone (ADR-069).
    deletionScheduledAt: date('deletion_scheduled_at', { mode: 'string' }),
    /**
     * The organization this account's deletion goes with, when its only
     * member deleted both in one step (ADR-070, amended). The account's,
     * not the organization's: set and cleared with the account's day, so
     * no cancel, completion or leaving can strand it, and cleared by the
     * database when the organization is deleted.
     */
    deletionWithOrganizationId: uuid(
      'deletion_with_organization_id',
    ).references((): AnyPgColumn => organizations.id, { onDelete: 'set null' }),
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
    // For the cascade that clears it when an organization is deleted, and
    // for the Account page's cancel, which finds the organization by it.
    index('users_deletion_with_organization_id_idx')
      .on(t.deletionWithOrganizationId)
      .where(sql`${t.deletionWithOrganizationId} is not null`),
  ],
);
