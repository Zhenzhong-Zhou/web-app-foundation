import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import type { PriceListsService } from './price-lists.service';

type PriceList = Awaited<ReturnType<PriceListsService['findById']>>;
type PriceListItem = PriceList['items'][number] & { currency: string };

/** One price list's items (ADR-057), each with the list's currency. */
export const PRICE_LIST_COLUMNS: ExportColumn<PriceListItem>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.description },
  { header: HEADERS.unit, value: (row) => row.unitOfMeasure },
  { header: HEADERS.price, value: (row) => row.unitPrice },
  { header: HEADERS.currency, value: (row) => row.currency },
];
