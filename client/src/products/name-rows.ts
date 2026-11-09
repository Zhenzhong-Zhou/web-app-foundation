import type { ProductDetail } from '../api/types.gen';
import type { Locale } from '../lib/locales';

/**
 * The rows of Names in other languages on the item's page (ADR-092), and
 * which of their names documents will refuse, kept out of the
 * component's file so it exports components alone.
 */

/** Where Edit names opens: the item's row, or a variation's by its id. */
export interface NameAt {
  row: 'product' | string;
  locale: Locale;
}

/** A row of the table: the item, or a variation with a name of its own. */
export interface NameRow {
  key: 'product' | string;
  /** The variation's code; none for the item's row. */
  sku: string | null;
  /** The base name: the item's, or the variation's own. */
  name: string;
  names: Partial<Record<Locale, string>>;
}

/** The item and each variation with a name of its own, as documents print them. */
export function rowsOf(product: ProductDetail): NameRow[] {
  return [
    {
      key: 'product',
      sku: null,
      name: product.name,
      names: Object.fromEntries(
        product.translations.map((row) => [row.locale, row.name]),
      ),
    },
    ...product.variants
      .filter((variant) => variant.name)
      .map((variant) => ({
        key: variant.id,
        sku: variant.sku,
        name: variant.name!,
        names: Object.fromEntries(
          (variant.translations ?? []).map((row) => [row.locale, row.name]),
        ),
      })),
  ];
}

/**
 * Each name a document requires that is missing, as the server checks it
 * before printing (ADR-054, amended): the item's, or a named variation's,
 * in a language the organization requires.
 */
export function missingNames(
  product: ProductDetail,
  required: readonly Locale[],
): (NameAt & { sku: string | null })[] {
  return rowsOf(product).flatMap((row) =>
    required
      .filter((locale) => !row.names[locale])
      .map((locale) => ({ row: row.key, sku: row.sku, locale })),
  );
}
