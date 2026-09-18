import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Something somebody should be told about (ADR-036).
 *
 * One row per recipient, not per event: read state is per person, and three
 * recipients is three rows. A shared event with a separate reads table is the
 * normalised shape and machinery for a scale that does not exist here.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: primaryKey(),

    /**
     * The recipient, and the only scope that matters. Every query filters on
     * this — a notification addressed to somebody else is not theirs to read
     * whichever tenant they are in.
     *
     * CASCADE, unlike the audit log's RESTRICT: this is a message, not a
     * record. When an account goes, its unread notifications have nobody to
     * inform.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Nullable, which makes this the one table not scoped by tenant.
     *
     * The same problem ADR-022 solved for account events: "somebody signed in
     * to your account" has no organization, and a user between organizations
     * still needs telling. Kept rather than dropped because an org-scoped
     * notification should go when its context does.
     */
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    /** `resource.event`, matching the audit vocabulary: 'production.variance'. */
    type: text('type').notNull(),

    /** Where clicking it goes. Not a foreign key — the target may be any table. */
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),

    /** One line, already written. Rendering is not the reader's job. */
    title: text('title').notNull(),

    /** The detail, when there is any worth a second line. */
    body: text('body'),

    /**
     * Null until read. A timestamp rather than a boolean, because "when did
     * they see this" is the follow-up question and costs nothing to keep.
     */
    readAt: timestamp('read_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    /**
     * The bell's two queries: the unread count, and the list. Partial on
     * read_at because the count is the one that runs on every page load and
     * almost every row is eventually read.
     */
    index('notifications_user_unread_idx')
      .on(t.userId, t.id.desc())
      .where(sql`read_at is null`),

    // The full list, newest first, on a UUIDv7 cursor (ADR-018).
    index('notifications_user_id_idx').on(t.userId, t.id.desc()),

    check(
      'notifications_title_not_blank_check',
      sql`length(btrim(${t.title})) > 0`,
    ),
  ],
);
