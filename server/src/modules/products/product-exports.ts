import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import type { Locale } from '../../common/locales';
import { PRODUCT_TYPE_WORDS } from '../../common/product-types';
import type { ProductType } from '../../database/schema';
import { t, type Translatable, translate } from '../../i18n/translate';

/** A row of the catalogue export: a variant, with its product. */
export interface ProductExportRow {
  id: string;
  sku: string;
  productName: string;
  variantName: string | null;
  type: ProductType;
  /** Its category's names from the top, or null: Uncategorised. */
  category: string[] | null;
  unitOfMeasure: string;
  tracksLots: boolean;
  discontinued: boolean;
  /** The product's names in each language it has one in. */
  productNames: Partial<Record<Locale, string>>;
  /** The variant's names in each language it has one in. */
  variantNames: Partial<Record<Locale, string>>;
}

/** Each language's two columns, the product's name and the variant's. */
const NAMES: Record<Locale, { product: Translatable; variant: Translatable }> =
  {
    en: {
      product: t({
        id: 'exports.column.nameEnglish',
        defaultMessage: 'Name in English',
      }),
      variant: t({
        id: 'exports.column.variantEnglish',
        defaultMessage: 'Variant in English',
      }),
    },
    'fr-CA': {
      product: t({
        id: 'exports.column.nameFrench',
        defaultMessage: 'Name in French',
      }),
      variant: t({
        id: 'exports.column.variantFrench',
        defaultMessage: 'Variant in French',
      }),
    },
    'zh-Hans': {
      product: t({
        id: 'exports.column.nameChinese',
        defaultMessage: 'Name in Chinese',
      }),
      variant: t({
        id: 'exports.column.variantChinese',
        defaultMessage: 'Variant in Chinese',
      }),
    },
  };

/**
 * The catalogue export (ADR-057): a row per variant, its type in the
 * reader's words and its category's path (ADR-092), then the product's and
 * the variant's name in every language they have one in (#306's 21).
 */
export function productColumns(
  locale: Locale,
): ExportColumn<ProductExportRow>[] {
  const languages = Object.keys(NAMES) as Locale[];
  return [
    { header: HEADERS.sku, value: (row) => row.sku },
    { header: HEADERS.item, value: (row) => row.productName },
    {
      header: t({ id: 'exports.column.variant', defaultMessage: 'Variant' }),
      value: (row) => row.variantName,
    },
    {
      header: t({ id: 'exports.column.type', defaultMessage: 'Type' }),
      value: (row) =>
        row.type in PRODUCT_TYPE_WORDS
          ? translate(PRODUCT_TYPE_WORDS[row.type], locale)
          : row.type,
    },
    {
      header: t({ id: 'exports.column.category', defaultMessage: 'Category' }),
      value: (row) => row.category?.join(' › ') ?? null,
    },
    { header: HEADERS.unit, value: (row) => row.unitOfMeasure },
    {
      header: t({
        id: 'exports.column.tracksLots',
        defaultMessage: 'Tracks lots',
      }),
      value: (row) => row.tracksLots,
    },
    {
      header: t({
        id: 'exports.column.discontinued',
        defaultMessage: 'Discontinued',
      }),
      value: (row) => row.discontinued,
    },
    ...languages.map((language): ExportColumn<ProductExportRow> => ({
      header: NAMES[language].product,
      value: (row) => row.productNames[language] ?? null,
    })),
    ...languages.map((language): ExportColumn<ProductExportRow> => ({
      header: NAMES[language].variant,
      value: (row) => row.variantNames[language] ?? null,
    })),
  ];
}
