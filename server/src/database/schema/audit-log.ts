import {
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { organizations } from './organizations';
import { users } from './users';

/**
 * Append-only record of who changed what (ADR-012).
 *
 * **Every foreign key here is RESTRICT and must stay that way.** Cascading from
 * organizations would destroy exactly the records the 24-month retention window
 * requires. Org deletion is handled by its own anonymisation pass, never by
 * cascade.
 *
 * Because users are soft-deleted, these constraints should never fire in normal
 * operation. That is the point: they are a tripwire. A future hard
 * DELETE FROM users is refused by the database rather than silently shredding
 * the audit trail.
 *
 * No updated_at: an audit row that can be edited is not an audit row.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),

    // Nullable: some events have no actor (a scheduled expiry, a system job).
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'restrict',
    }),

    // `resource.action`, matching the permission vocabulary: 'users.create'.
    action: text('action').notNull(),

    // What was acted on. Not a foreign key — the target may be any table, and
    // may since have been deleted.
    resourceType: text('resource_type'),
    resourceId: uuid('resource_id'),

    // Before/after values, request details — whatever the event needs.
    // JSONB rather than columns, because the shape differs per action (ADR-002).
    payload: jsonb('payload'),

    // Captured at event time, because the user row will later stop identifying
    // anyone. Nulled at the 24-month boundary (ADR-012).
    ip: inet('ip'),
    userAgent: text('user_agent'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // ADR-003 requires this on every tenant-scoped table.
    index('audit_log_organization_id_idx').on(t.organizationId),

    // "What did this user do?" — the most common investigative query.
    index('audit_log_actor_id_idx').on(t.actorId),

    // Time-range queries, and the scheduled PII-stripping pass.
    index('audit_log_created_at_idx').on(t.createdAt),

    // "What happened to this record?"
    index('audit_log_resource_idx').on(t.resourceType, t.resourceId),
  ],
);
