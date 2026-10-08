import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { ProductsService } from './products.service';

type ProductRow = Awaited<ReturnType<ProductsService['exportRows']>>[number];

/** The catalogue export (ADR-057): a row per variant. */
export const PRODUCT_COLUMNS: ExportColumn<ProductRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  {
    header: t({ id: 'exports.column.variant', defaultMessage: 'Variant' }),
    value: (row) => row.variantName,
  },
  {
    header: t({ id: 'exports.column.type', defaultMessage: 'Type' }),
    value: (row) => row.type,
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
  {
    header: t({
      id: 'exports.column.nameFrench',
      defaultMessage: 'Name in French',
    }),
    value: (row) => row.nameFrench,
  },
  {
    header: t({
      id: 'exports.column.nameChinese',
      defaultMessage: 'Name in Chinese',
    }),
    value: (row) => row.nameChinese,
  },
];
