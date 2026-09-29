import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { priceLists } from './price-lists';
import { productVariants } from './product-variants';

/**
 * One item's price on one list (ADR-049): per unit of the variant's unit of
 * measure, net of tax, in the list's currency — exactly what an order line's
 * unit_price holds (ADR-035), since it is copied there.
 *
 * One price per item per list. Quantity breaks and dated prices are open
 * decisions; both would arrive as extra columns with defaults, so nothing
 * here needs rewriting when they do.
 */
export const priceListItems = pgTable(
  'price_list_items',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'restrict' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Zero is a price, as on a line. */
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),

    ...timestamps,
  },
  (t) => [
    /** One price per item per list — and the index the lookup reads. */
    uniqueIndex('price_list_items_list_variant_key').on(
      t.priceListId,
      t.variantId,
    ),

    /** Which lists price an item, for its product page. */
    index('price_list_items_org_variant_idx').on(t.organizationId, t.variantId),

    check(
      'price_list_items_unit_price_not_negative_check',
      sql`${t.unitPrice} >= 0`,
    ),
  ],
);
