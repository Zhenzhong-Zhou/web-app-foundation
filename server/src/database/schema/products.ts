import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * What a thing is *for*, not what it is made of. Sellable goods, raw material,
 * packaging, samples, and office supplies all carry a SKU, sit in a location,
 * and move — they differ only in what they connect to, which is relationships
 * rather than tables (ADR-023).
 *
 * Closed set with a check constraint, like auth_tokens.purpose: a typo would
 * otherwise produce a product nobody's filter ever matches.
 */
export const PRODUCT_TYPES = [
  'good', // sold to customers
  'material', // consumed by production
  'packaging',
  'sample',
  'supply', // consumed internally; office supplies
  'equipment', // tools and machinery; tracked and located, never sold
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * A grouping for display, not the thing that is counted. "Vitamin D3" is a
 * product; "Vitamin D3, 60ct" is a variant and is what sits on a shelf
 * (ADR-023).
 *
 * No SKU and no quantity here, deliberately. Both live on the variant, and
 * every product has at least one — including products with no variation, which
 * get one auto-created. That is what keeps every stock query free of a branch.
 */
export const products = pgTable(
  'products',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the org owns its catalogue.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    type: text('type').notNull(),

    name: text('name').notNull(),
    description: text('description'),

    /**
     * Discontinued rather than deleted. A variant with movement history cannot
     * be removed without inventing gaps in the ledger (ADR-012's reasoning
     * applied to stock), so this is how a catalogue shrinks.
     *
     * Added now because retrofitting means changing every list query at once.
     */
    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    check(
      'products_type_check',
      sql`${t.type} in ('good', 'material', 'packaging', 'sample', 'supply', 'equipment')`,
    ),
    // Not unique: two products may share a name, and the SKU on the variant is
    // what identifies. Rejecting a duplicate name would block a legitimate
    // catalogue for no gain.
    index('products_org_name_idx').on(t.organizationId, t.name),
    index('products_organization_id_idx').on(t.organizationId),
  ],
);
