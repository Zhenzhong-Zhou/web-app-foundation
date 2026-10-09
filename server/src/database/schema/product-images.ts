import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { files } from './files';
import { organizations } from './organizations';
import { products } from './products';

/**
 * A product's gallery (ADR-062): up to eight files of kind product_image,
 * in order from 0, the first its cover. One file belongs to one product;
 * the file is attached when added and released when removed (ADR-059).
 */
export const productImages = pgTable(
  'product_images',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .unique('product_images_file_id_unique')
      .references(() => files.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // A product's gallery in order, and every list's cover at position 0.
    index('product_images_org_product_position_idx').on(
      t.organizationId,
      t.productId,
      t.position,
    ),
  ],
);
