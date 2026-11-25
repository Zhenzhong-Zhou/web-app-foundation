import { asMoney, asQuantity, type ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { CostsService } from './costs.service';

/**
 * A pool as everyPool() returns it, its raw row's values named, with
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
  valuation: Awaited<ReturnType<CostsService['everyPool']>>,
): Pool[] {
  return valuation.pools.map((pool) => ({
    ...(pool as Omit<Pool, 'currency'>),
    currency: valuation.currency,
  }));
}

/**
 * A provisional pool worth nothing, every unit of it waiting, has no unit
 * cost: 0.00 would read as a price, so its cell is empty, its Value and
 * Provisional as ever. Its value is read for a digit other than zero, as
 * this module's `EXCHANGE_RATE` reads a rate above zero and invoices'
 * `chargesTax` a tax, never as a float (ADR-025). The page says "Waits for
 * a cost" in the same pool's place, `waitsForCost` in
 * client/src/costs/stock-value-page.tsx; the rule is docs/rules/stock.md's,
 * under Stock value: "A provisional pool worth nothing says “Waits for a
 * cost” in place of its unit cost".
 */
function unitCostOf(row: Pool): string | null {
  return row.provisional && !/[1-9]/.test(row.value) ? null : row.unitCost;
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
    unitCostOf,
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
