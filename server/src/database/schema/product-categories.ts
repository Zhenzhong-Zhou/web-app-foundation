import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * The organization's categories for its items (ADR-092): one tree, nested
 * as locations are, and an item in one category or none. A table rather
 * than a text column, so a category is renamed or moved once and every
 * item in it follows.
 */
export const productCategories = pgTable(
  'product_categories',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the organization owns its categories.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * Null at the top. RESTRICT, as locations': a category holding others
     * is refused deletion until they move, and the service says so first.
     */
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => productCategories.id,
      { onDelete: 'restrict' },
    ),

    name: text('name').notNull(),

    /**
     * The name's pinyin, full and initials, written by the server whenever
     * the name is saved, null when it has no Chinese: categories are listed
     * as items are, a Chinese name by its pinyin (ADR-056, ADR-092).
     */
    namePinyin: text('name_pinyin'),

    ...timestamps,
  },
  (t) => [
    // A category cannot hold itself. Deeper loops are refused by the
    // service, which walks the branch under a lock.
    check(
      'product_categories_no_self_parent_check',
      sql`${t.id} <> ${t.parentId}`,
    ),
    /**
     * Unique by name under one parent. NULLS NOT DISTINCT is what makes it
     * hold at the top, where every parent is null: without it two top-level
     * "Vitamins" would both be allowed.
     */
    unique('product_categories_org_parent_name_key')
      .on(t.organizationId, t.parentId, t.name)
      .nullsNotDistinct(),
    // The parent's key, for the self-reference's check when a category is
    // deleted.
    index('product_categories_parent_id_idx').on(t.parentId),
  ],
);
