import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * Closed set, all raised from core/auth. Unlike AUDIT_ACTIONS (ADR-018),
 * which stays open because feature modules add to it as they are built, this
 * list is complete — so it is enforced by a check constraint rather than by
 * convention.
 */
export const ACCOUNT_EVENT_ACTIONS = [
  'session.created',
  'session.ended',
  'session.revoked',
  'account.password_changed',
  'account.password_reset',
  'account.profile_updated',
  'account.email_verified',
] as const;

export type AccountEventAction = (typeof ACCOUNT_EVENT_ACTIONS)[number];

/**
 * "What happened to my account", read by one person deciding whether someone
 * else got in (ADR-022). Separate from audit_log, which answers "what did
 * people do in our workspace" for an admin.
 *
 * No organization_id, deliberately: a password change is not business data,
 * and ADR-012's premise is that the organization owns business data.
 */
export const accountEvents = pgTable(
  'account_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`uuidv7()`),

    // CASCADE, unlike audit_log.actor_id's RESTRICT. An audit row must
    // outlive its actor because the organization still needs the record; an
    // account event has no audience once its subject is gone.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    action: text('action').notNull(),

    // Captured at event time (ADR-012). The session these describe is
    // frequently gone by the time anyone reads the event.
    ip: inet('ip'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'account_events_action_check',
      sql`${table.action} in ('session.created', 'session.ended', 'session.revoked', 'account.password_changed', 'account.password_reset', 'account.profile_updated', 'account.email_verified')`,
    ),
    // (user_id, id desc) rather than created_at: UUIDv7 sorts by creation
    // time (ADR-010), so one index serves both the read and the keyset cursor
    // a future "recent activity" panel will need.
    index('account_events_user_id_id_idx').on(table.userId, table.id),
  ],
);
