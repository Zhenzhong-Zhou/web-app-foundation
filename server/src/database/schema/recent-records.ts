import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { memberships } from './memberships';
import { organizations } from './organizations';

/** The kinds of record whose opening is remembered (ADR-058). */
export const RECENT_KINDS = [
  'order',
  'invoice',
  'lot',
  'product',
  'partner',
  'run',
  'return',
  'priceList',
] as const;
export type RecentKind = (typeof RECENT_KINDS)[number];

/**
 * Recently opened (ADR-058): one row per person, organization and record,
 * its time moved on when the record is opened again; past 30 a person's
 * oldest are dropped. The person's own convenience, not an audit trail:
 * it belongs to their membership, and goes with it.
 */
export const recentRecords = pgTable(
  'recent_records',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    recordId: uuid('record_id').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Removed with the membership, so leaving an organization leaves its
    // history behind with it.
    foreignKey({
      name: 'recent_records_membership_fk',
      columns: [t.userId, t.organizationId],
      foreignColumns: [memberships.userId, memberships.organizationId],
    }).onDelete('cascade'),
    uniqueIndex('recent_records_person_record_key').on(
      t.organizationId,
      t.userId,
      t.kind,
      t.recordId,
    ),
    // A person's history, newest first: the only way it is read.
    index('recent_records_person_opened_idx').on(
      t.organizationId,
      t.userId,
      t.openedAt.desc(),
    ),
    check(
      'recent_records_kind_check',
      sql`${t.kind} in ('order', 'invoice', 'lot', 'product', 'partner', 'run', 'return', 'priceList')`,
    ),
  ],
);
