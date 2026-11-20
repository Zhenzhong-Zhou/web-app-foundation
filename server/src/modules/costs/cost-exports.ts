import { asMoney, asQuantity, type ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { CostsService } from './costs.service';

/**
 * A pool as stockValuation() returns it, its raw row's values named, with
 * the valuation's currency beside it.
 */
interface Pool {
  sku: string;
  lotCode: string | null;
  quantity: string;
  value: string;
  unitCost: string | null;
  provisional: boolean;
  /** Null until the organization has a base currency. */
  currency: string | null;
}

/** The valuation's pools, each with the currency, for the columns below. */
export function poolsOf(
  valuation: Awaited<ReturnType<CostsService['stockValuation']>>,
): Pool[] {
  return valuation.pools.map((pool) => ({
    ...(pool as Omit<Pool, 'currency'>),
    currency: valuation.currency,
  }));
}

/**
 * Stock value (ADR-057): each pool as the costs page shows it, as at the
 * moment of export, in the organization's base currency, its cost and value
 * at that currency's places (99a).
 */
export const VALUATION_COLUMNS: ExportColumn<Pool>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.lot, value: (row) => row.lotCode },
  asQuantity(HEADERS.quantity, (row) => row.quantity),
  asMoney(
    t({ id: 'exports.column.unitCost', defaultMessage: 'Unit cost' }),
    (row) => row.unitCost,
    (row) => row.currency,
  ),
  asMoney(
    t({ id: 'exports.column.value', defaultMessage: 'Value' }),
    (row) => row.value,
    (row) => row.currency,
  ),
  { header: HEADERS.currency, value: (row) => row.currency },
  {
    header: t({
      id: 'exports.column.provisional',
      defaultMessage: 'Provisional',
    }),
    value: (row) => row.provisional,
  },
];
