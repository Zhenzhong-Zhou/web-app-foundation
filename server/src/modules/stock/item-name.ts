import { type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';

/**
 * "Focus (60ct)", or "Focus" when the variant has no name of its own.
 *
 * The one rule for naming an item wherever a person reads it — a packing
 * slip, an order, a recall list — so the same box is never called two
 * different things on two screens.
 */
export function itemName(
  productName: string,
  variantName: string | null,
): string {
  return variantName ? `${productName} (${variantName})` : productName;
}

/**
 * The outer query's products and product_variants, by the names it gives
 * them. Plain SQL, not Drizzle's columns: Drizzle writes a column without
 * its table name in a query with no joins, which the correlated subqueries
 * below would read as their own.
 */
export interface ItemTables {
  product: string;
  variant: string;
}

const TABLES: ItemTables = { product: 'products', variant: 'product_variants' };

/**
 * The outer product's or variant's translation in the locale, as a
 * correlated subquery giving `column`, read from the translation as `tr`:
 * its name unless asked otherwise, and null where it has none. Every read
 * of a translation beside its item goes through it, so each names the
 * organization (ADR-003).
 */
export function translationOf(
  item: 'product' | 'variant',
  outer: string,
  locale: Locale,
  organizationId: string,
  column: SQL = sql`tr.name`,
): SQL {
  const [table, key] =
    item === 'product'
      ? ['product_translations', 'product_id']
      : ['variant_translations', 'variant_id'];

  return sql`(
    select ${column} from ${sql.raw(table)} tr
    where tr.${sql.raw(key)} = ${sql.raw(outer)}.id
      and tr.locale = ${locale}
      and tr.organization_id = ${organizationId}::uuid
  )`;
}

/**
 * An item's names in the reader's language (ADR-054, ADR-056), for every
 * read that names an item for a person: the product's and the variant's
 * translation in the locale, each else the base name. A variant with no
 * name of its own keeps none, as itemName joins them. Null is the base
 * names, which documents and CSV exports read through the same functions.
 *
 * Resolved here, on the server, so no screen chooses among translations.
 */
export function namesIn(
  locale: Locale | null,
  organizationId: string,
  tables: ItemTables = TABLES,
): { productName: SQL<string>; variantName: SQL<string | null> } {
  const product = sql.raw(tables.product);
  const variant = sql.raw(tables.variant);

  if (locale === null) {
    return {
      productName: sql<string>`${product}.name`,
      variantName: sql<string | null>`${variant}.name`,
    };
  }

  return {
    productName: sql<string>`coalesce(${translationOf('product', tables.product, locale, organizationId)}, ${product}.name)`,
    variantName: sql<string | null>`case when ${variant}.name is not null
      then coalesce(${translationOf('variant', tables.variant, locale, organizationId)}, ${variant}.name)
    end`,
  };
}

/**
 * Products in the order of the name shown (ADR-056): a Chinese name by its
 * pinyin, as a Chinese reader expects, and any other accent-free, as
 * search_text() reads it, so a name with no Chinese still sorts among them.
 * The pinyin is the shown name's: the translation's where the product has
 * one in the locale, else the base name's.
 */
export function productNameOrder(
  locale: Locale,
  organizationId: string,
  product = TABLES.product,
): SQL {
  const outer = sql.raw(product);
  const shown = translationOf(
    'product',
    product,
    locale,
    organizationId,
    sql`coalesce(tr.name_pinyin, search_text(tr.name))`,
  );

  return sql`coalesce(${shown}, ${outer}.name_pinyin, search_text(${outer}.name))`;
}
