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
import { productVariants } from './product-variants';

/**
 * A specific production run of one variant — what a recall is issued against
 * and what an expiry date belongs to.
 *
 * Named `lots` rather than `batches` because that is the word already on the
 * screen ("Track lot numbers and expiry") and because `batch` is what everyone
 * calls bulk operations. One word, two meanings, in a codebase that will
 * eventually have a bulk import endpoint, is a standing tax.
 *
 * Hangs off the variant, not the product: "Vitamin D3, 60ct" is what has a lot
 * number; "Vitamin D3" does not (ADR-023).
 */
export const lots = pgTable(
  'lots',
  {
    id: primaryKey(),

    // Denormalised from the variant for the same reason it is denormalised
    // onto product_variants: TenantDb scopes this table directly, without a
    // join whose only purpose is to find the tenant (ADR-003).
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      // RESTRICT, not CASCADE. A variant with lots has movement history, and
      // ADR-023 already forbids deleting it — discontinuing is the mechanism.
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** What the supplier printed. "L2024-A", "240115". Typed, never generated. */
    code: text('code').notNull(),

    /**
     * Null for lots that do not expire — hardware, packaging, most equipment.
     * Date, not timestamp: an expiry is a calendar fact printed on a box, and
     * giving it a time of day invents precision the label does not have.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    /**
     * When this lot physically arrived. Distinct from created_at, which is
     * when someone typed it in — a receipt entered three days late is normal
     * and FEFO picking needs the real date.
     */
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * True only when no code existed and the receiver had to invent one.
     *
     * False when the code came from an authoritative source — printed by the
     * supplier, or issued by this organization's own numbering scheme for a
     * production run. The flag is about provenance, not about who typed it:
     * a manufactured lot code is ours and is authoritative, so it is false.
     *
     * Leaving the lot null would break the invariant; inventing a code
     * silently is worse. During a recall the question is which units came from
     * the affected run, and a code nobody printed cannot be matched against a
     * supplier's affected-lot list — so the distinction is recorded rather
     * than hidden.
     */
    isAssigned: boolean('is_assigned').notNull().default(false),

    ...timestamps,
  },
  (t) => [
    // Per variant, not per organization: two different products may legitimately
    // carry the same supplier lot code, and they are not the same lot.
    uniqueIndex('lots_org_variant_code_key').on(
      t.organizationId,
      t.variantId,
      t.code,
    ),
    // FEFO picking and expiry reporting both read "soonest first, within an
    // organization". Partial, because lots that never expire are the majority
    // in a mixed catalogue and do not belong in this index.
    index('lots_org_expires_at_idx')
      .on(t.organizationId, t.expiresAt)
      .where(sql`${t.expiresAt} is not null`),
    index('lots_variant_id_idx').on(t.variantId),
    check('lots_code_not_blank_check', sql`length(btrim(${t.code})) > 0`),
  ],
);
