import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { users } from './users';

/**
 * Single-use tokens for email verification and password reset.
 *
 * **No organization_id.** Like `users`, these belong to a global identity
 * rather than to a tenant (ADR-004) — a password reset is an account action,
 * and the user may hold memberships in several organizations.
 *
 * One table for both purposes because the columns, the hashing, the expiry
 * check, the single-use rule, and the sweep are identical; only the lifetime
 * differs, and that is a value rather than a schema. Invitations (ADR-006)
 * will be the third purpose.
 *
 * No `created_at` trigger and no `updated_at`: a token is written once and
 * consumed once, never edited.
 */
export const AUTH_TOKEN_PURPOSES = [
  'email_verification',
  'password_reset',
] as const;

export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: primaryKey(),

    // SHA-256 of the value sent to the user, never the value itself — the same
    // reasoning as sessions (ADR-011). A database leak yields nothing
    // replayable, and a fast hash is right because the token is 32 bytes of
    // CSPRNG output with nothing to guess.
    tokenHash: text('token_hash').notNull(),

    // CASCADE per ADR-012: a token exists only to serve one user.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Checked against AUTH_TOKEN_PURPOSES by the check constraint below.
    // text rather than a pg enum: adding a value to an enum type needs
    // ALTER TYPE, which cannot run inside some migration transactions,
    // whereas widening a check constraint is plain DDL.
    purpose: text('purpose').notNull(),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Single use. Marked rather than deleted so a second click can be told the
    // link was already used instead of that it is invalid — the token is spent
    // either way, so the distinction leaks nothing.
    consumedAt: timestamp('consumed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_tokens_token_hash_key').on(t.tokenHash),
    // Supports the lazy sweep and "invalidate this user's outstanding reset
    // tokens", both of which filter by user and purpose.
    index('auth_tokens_user_purpose_idx').on(t.userId, t.purpose),
    // purpose separates "verifies an email" from "grants a password change".
    // A typo writing 'password-reset' would create a token no lookup ever
    // matches — silent, and surfacing only as users reporting dead links.
    check(
      'auth_tokens_purpose_check',
      sql`${t.purpose} IN ('email_verification', 'password_reset')`,
    ),
  ],
);
