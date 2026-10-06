import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { products } from './products';

/**
 * A product's name and description in another language (ADR-054).
 *
 * The product's own columns stay the base text, in whatever language the
 * organization works in, and the fallback for every language. A row here
 * exists only where someone entered a translation.
 *
 * Rows rather than a column per language (`name_zh`): a language is data,
 * never a migration, and an organization that translates nothing has
 * nothing here. The tag is checked by the DTOs against SUPPORTED_LOCALES,
 * not by a constraint, for the same reason.
 *
 * Cascades with its product: a translation has no life of its own.
 */
export const productTranslations = pgTable(
  'product_translations',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    locale: text('locale').notNull(),

    name: text('name').notNull(),
    description: text('description'),

    ...timestamps,
  },
  (t) => [
    // One name per language. Also serves "these products in this language".
    uniqueIndex('product_translations_product_locale_key').on(
      t.productId,
      t.locale,
    ),

    // A blank translation would print as an empty line instead of falling
    // back to the base name.
    check(
      'product_translations_name_not_blank_check',
      sql`length(btrim(${t.name})) > 0`,
    ),
    check(
      'product_translations_description_not_blank_check',
      sql`${t.description} is null or length(btrim(${t.description})) > 0`,
    ),
  ],
);
