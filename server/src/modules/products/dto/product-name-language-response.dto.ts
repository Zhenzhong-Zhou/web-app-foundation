import type { Locale } from '../../../common/locales';

/**
 * Choosing the language the items are named in, as the API returns it
 * (ADR-068; ADR-054, amended for #531), described for the OpenAPI document
 * by the CLI plugin.
 */

/** A name kept in the language that differs from its own, to choose between. */
export class ProductNameToChoose {
  kind!: 'item' | 'variant';
  /** The item's id, or the variant's. */
  id!: string;
  /** Its item's id: the item's own for an item. */
  productId!: string;
  /** A variant's code; null for an item. */
  sku!: string | null;
  /** Null for a variant with no name of its own. */
  ownName!: string | null;
  keptName!: string;
  /** An item's; null for a variant, which has none. */
  ownDescription!: string | null;
  keptDescription!: string | null;
}

/** GET /organization/product-name-language: what choosing it will do. */
export class ProductNameLanguagePreview {
  language!: Locale;
  /** The items whose own names will count as the language's. */
  items!: number;
  /** And the variants with a name of their own. */
  variants!: number;
  /** Names kept in it the same as their own, removed as copies. */
  copies!: number;
  /** Names kept in it that differ, each to be chosen. */
  total!: number;
  /** Those that differ, at most 500, by their item's name. */
  differing!: ProductNameToChoose[];
}

/** PUT /organization/product-name-language: what the choice did. */
export class ProductNameLanguageChosen {
  copiesRemoved!: number;
  /** Kept names removed where the own name was chosen. */
  namesRemoved!: number;
  /** Items and variants renamed to the kept name chosen. */
  renamed!: number;
}
