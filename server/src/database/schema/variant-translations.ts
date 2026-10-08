import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

    /**
     * The name's pinyin, full and initials, for search (ADR-056): written by
     * the server whenever the name is saved, null when the name has no
     * Chinese. "深海鱼油" holds "shenhaiyuyou shyy".
     */
    namePinyin: text('name_pinyin'),
  },
  (t) => [
    // Search (ADR-056): trigram indexes, which serve ILIKE '%…%' and close
    // matches; names through immutable_unaccent, codes as stored.
    index('variant_translations_name_trgm_idx').using(
      'gin',
      sql`immutable_unaccent(${t.name}) gin_trgm_ops`,
    ),
    index('variant_translations_name_pinyin_trgm_idx').using(
      'gin',
      sql`${t.namePinyin} gin_trgm_ops`,
    ),
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
