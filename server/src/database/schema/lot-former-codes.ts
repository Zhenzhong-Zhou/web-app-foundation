import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, trigramIndex } from './columns';
import { lots } from './lots';
import { organizations } from './organizations';
import { users } from './users';

/**
 * A code a lot had before Edit lot details corrected it (ADR-094 amended,
 * R8): kept with until when, who changed it and why, so the lot is still
 * found by it, shown with it, and the code is never given to another lot
 * of the item. Written in the save that corrects the code; none is filled
 * in from before, since nothing kept the old code then.
 *
 * Immutable, like a shipment: changed_at and no updated_at. A lot that
 * leaves a code twice has a row each time.
 */
export const lotFormerCodes = pgTable(
  'lot_former_codes',
  {
    id: primaryKey(),

    // Denormalised from the lot, as lots has it from the variant: TenantDb
    // scopes this table, and its search index leads with it (ADR-003).
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** CASCADE: a lot's former codes are kept as long as the lot. */
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id, { onDelete: 'cascade' }),

    /** The code as the lot had it, as stored. */
    code: text('code').notNull(),

    /** When it stopped being the lot's: the save that corrected it. */
    changedAt: timestamp('changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** RESTRICT, as orders and movements: ADR-012 anonymises, never deletes. */
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * Why the code changed, as typed: asked only when it changes (E2a).
     * Free text, so it stays out of the Activity log's payload (ADR-018).
     */
    reason: text('reason').notNull(),
  },
  (t) => [
    // Every lot search finds a lot by a former code, as by its own (R10).
    trigramIndex('lot_former_codes_code_trgm_idx', t.organizationId, t.code),
    // A lot's own, newest first on its page, and the code a movement's lot
    // had when the movement was made.
    index('lot_former_codes_lot_idx').on(t.lotId, t.changedAt),
    check(
      'lot_former_codes_code_not_blank_check',
      sql`length(btrim(${t.code})) > 0`,
    ),
    check(
      'lot_former_codes_reason_not_blank_check',
      sql`length(btrim(${t.reason})) > 0`,
    ),
  ],
);
