import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * A registration a formulation is made and sold under — an NPN in Canada, a
 * DIN, a cosmetic notification number, an FCC ID, a flammability certification
 * (ADR-029).
 *
 * A table rather than a column on `boms`, because one licence covers several
 * recipes. A licence attaches to a formulation, dosage form, and recommended
 * use; pack size is none of those, so Vitamin D3 60ct and 120ct are two BOMs
 * under one number. A column would copy that number into every pack size and
 * leave the next amendment to update all of them — a job nobody finishes.
 *
 * Deliberately just identity. Amendment history, renewal dates, submission
 * tracking, label versions, and certificates of analysis are the compliance
 * domain and are still open — this is the registry those would hang off, not a
 * first instalment of them.
 */
export const productLicences = pgTable(
  'product_licences',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** The number itself, as issued. Never parsed, never generated. */
    number: text('number').notNull(),

    /**
     * Who issued it — "Health Canada", "FDA", "TGA". Free text, because the
     * point of the column is that schemes differ between markets; a check
     * constraint here would need widening for every country and would say
     * nothing useful in the meantime.
     */
    authority: text('authority').notNull(),

    /**
     * Withdrawn, expired, or superseded rather than deleted — the same reason
     * products and locations discontinue instead. A BOM version that was made
     * under a licence keeps pointing at it after it stops being current, and
     * that is the whole point of recording it.
     */
    isActive: boolean('is_active').notNull().default(true),

    /**
     * When the registration took effect. Nullable, because plenty are
     * recorded without anyone looking the date up, and useful for the one
     * case a number alone cannot express: a licence issued from a future
     * date, which happens on a renewal or a transfer and must not be
     * offered to a recipe a month early.
     */
    issuedAt: timestamp('issued_at', { withTimezone: true }),

    /**
     * Usually null, and that is not a design flaw. A Health Canada product
     * licence stays valid while the product is marketed and compliant — it is
     * the *site* licence that renews annually. Other schemes do expire: an FDA
     * facility registration renews on a cycle, an export certificate ends, an
     * ISO or UL certification has a date on it.
     *
     * A calendar day stored as timestamptz, like a lot's expiry, written as
     * UTC midnight and read back in UTC (ADR-025's neighbour: the client's
     * formatDay).
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    notes: text('notes'),

    ...timestamps,
  },
  (t) => [
    /**
     * One row per number per authority. The same digits could in principle be
     * issued by two regulators, so the authority is part of the identity.
     */
    uniqueIndex('product_licences_org_authority_number_key').on(
      t.organizationId,
      t.authority,
      t.number,
    ),

    index('product_licences_organization_id_idx').on(t.organizationId),

    check(
      'product_licences_number_not_blank_check',
      sql`length(btrim(${t.number})) > 0`,
    ),

    /**
     * A licence cannot lapse before it starts. Enforced here rather than only
     * in the service because the two dates are meaningless in that order, and
     * a row that says so would make every derived status wrong at once.
     */
    check(
      'product_licences_dates_ordered_check',
      sql`${t.issuedAt} is null or ${t.expiresAt} is null or ${t.issuedAt} <= ${t.expiresAt}`,
    ),
  ],
);
