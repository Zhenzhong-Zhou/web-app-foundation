import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { productLicences } from './product-licences';
import { productVariants } from './product-variants';

/**
 * A recipe: what one variant is made of (ADR-029).
 *
 * The header exists so versioning is cheap. A join table alone
 * (`parent_variant_id, component_variant_id, quantity`) is one row per
 * ingredient with nowhere to hang a version, a yield, or a status, and
 * retrofitting those means splitting the table after it holds data.
 *
 * Called `boms` and not `formulas` or `recipes` on purpose. This foundation is
 * meant to be re-pointed at a different industry (ADR-029), and BOM is the word
 * that already spans supplements, apparel, furniture, and machine shops.
 * Industry belongs in rows, never in table names.
 */
export const boms = pgTable(
  'boms',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * A variant, not a product — the same granularity decision as ADR-023.
     * Stock, lots, and movements all sit at the variant, so a BOM that named a
     * product could not tell a production order what to increment. 60ct and
     * 120ct of the same supplement are different recipes anyway.
     *
     * RESTRICT: a variant with a recipe is not deletable without deciding what
     * happens to every run that used it.
     */
    outputVariantId: uuid('output_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /**
     * Yield. The quantity of `output_variant_id` this set of lines produces —
     * "this batch makes 1000 capsules and consumes 2.4 kg".
     *
     * Not per single unit. Per-unit forces a division at data entry, someone
     * rounds 2.4/1000 to four places, and the rounding reappears as drift in
     * stock. With yield on the header, people type the numbers they already say
     * out loud, and the division happens once in the exploder where it can be
     * done against the full batch.
     */
    outputQuantity: numeric('output_quantity', {
      precision: 18,
      scale: 4,
    }).notNull(),

    /**
     * Rises by one per revision of the same output variant. Old versions are
     * kept rather than edited.
     *
     * Deliberately not an effective-date range. Dates answer "which recipe was
     * current on 3 March", which nobody asks; runs answer "what did this batch
     * consume", and they answer it from their own snapshot (ADR-029), not from
     * here. Dates can be added as two nullable columns later without touching
     * a row.
     */
    version: integer('version').notNull().default(1),

    /**
     * draft — being written, cannot be released against.
     * active — the one a new production order picks up. At most one per output.
     * archived — superseded; still referenced by the runs that used it.
     *
     * A label with a rule attached, unlike `locations.type`: the partial unique
     * index below makes "at most one active" mechanical rather than a service
     * convention, because the failure mode is a picker silently choosing
     * between two recipes.
     */
    status: text('status').notNull().default('draft'),

    /**
     * The registration this formulation is made under, when there is one.
     *
     * A reference rather than the number itself: one licence covers every pack
     * size of a formulation, so the number would otherwise be copied across
     * several BOMs and go stale in all but the one someone remembered to edit
     * (ADR-029).
     *
     * RESTRICT: a licence that a recipe was made under is not deletable. It is
     * withdrawn instead, and the BOM version keeps pointing at it — which is
     * how a lot traces back to the licence in force when it was made, through
     * the run's `bom_id`.
     */
    licenceId: uuid('licence_id').references(() => productLicences.id, {
      onDelete: 'restrict',
    }),

    notes: text('notes'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('boms_org_output_version_key').on(
      t.organizationId,
      t.outputVariantId,
      t.version,
    ),

    /**
     * One active recipe per output variant. Partial unique index rather than a
     * service check, for the same reason `addresses.is_default` got one
     * (ADR-028): a second active row is writable, the picker chooses
     * arbitrarily, and the bug is invisible until a batch is made wrong.
     */
    uniqueIndex('boms_one_active_per_output_key')
      .on(t.organizationId, t.outputVariantId)
      .where(sql`status = 'active'`),

    index('boms_organization_id_idx').on(t.organizationId),

    check('boms_output_quantity_positive_check', sql`${t.outputQuantity} > 0`),

    check('boms_version_positive_check', sql`${t.version} > 0`),

    check(
      'boms_status_check',
      sql`${t.status} in ('draft', 'active', 'archived')`,
    ),
  ],
);
