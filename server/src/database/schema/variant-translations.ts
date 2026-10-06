import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * A variant's name in another language (ADR-054): "60粒" beside "60ct".
 * The reasoning of product_translations, one level down.
 *
 * The name is required, though a variant's own may be null: a row exists
 * only to say something, and a variant with no name needs no translation.
 */
export const variantTranslations = pgTable(
  'variant_translations',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    locale: text('locale').notNull(),

    name: text('name').notNull(),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('variant_translations_variant_locale_key').on(
      t.variantId,
      t.locale,
    ),

    check(
      'variant_translations_name_not_blank_check',
      sql`length(btrim(${t.name})) > 0`,
    ),
  ],
);
