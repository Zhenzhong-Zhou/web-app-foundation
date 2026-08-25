import {
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Server-side sessions (ADR-011). Revocation is deletion — there is no separate
 * mechanism. Logout, password change, and admin-disables-user are all the same
 * DELETE with a different WHERE.
 *
 * Deliberately does not use the shared `timestamps` spread: issued_at and
 * last_seen_at already carry that meaning, and a session row is never "edited"
 * in the sense updated_at implies.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryKey(),

    // SHA-256 of the 32 random bytes handed to the client. Hashing, not
    // encryption: the value is only ever verified, never read back, so a
    // database leak yields no usable credentials.
    tokenHash: text('token_hash').notNull(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Mutable per-session state, which is precisely what a signed token cannot
    // hold — this is what makes org switching possible (ADR-011).
    // Not an ADR-003 ownership column: the session belongs to the user.
    currentOrgId: uuid('current_org_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // Two expiries. expires_at is an absolute cap; last_seen_at drives the idle
    // timeout. Sliding expiry alone lets a stolen token live forever.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    // For the "your active sessions" screen. Personal data — ADR-012's
    // retention rules apply.
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [
    // The hot path: every authenticated request looks a session up by hash.
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),

    // "Sign out everywhere", and listing a user's active sessions.
    index('sessions_user_id_idx').on(t.userId),

    // Lazy sweeping of expired rows during login (ADR-005: no job queue in V1).
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);
