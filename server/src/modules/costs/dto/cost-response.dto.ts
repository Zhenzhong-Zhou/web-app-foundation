import type { ValuationKind } from '../../../database/schema';

/**
 * What stock, lots and batches cost (ADR-048), as the API returns it
 * (ADR-068): described for the OpenAPI document by the CLI plugin. Every
 * amount is a decimal string, never a number (ADR-025).
 */

/** One pool of stock: an item, or one lot of it. */
export class ValuationPool {
  variantId!: string;
  sku!: string;
  lotId!: string | null;
  lotCode!: string | null;
  quantity!: string;
  value!: string;
  unitCost!: string;
  /** True while a row it depends on still waits for a cost. */
  provisional!: boolean;
}

/** What the stock on hand is worth, pool by pool. */
export class StockValuation {
  /** Null until the organization has a base currency. */
  currency!: string | null;
  total!: string;
  provisional!: boolean;
  pools!: ValuationPool[];
}

/** GET /costs/valuation. */
export class StockValuationEnvelope {
  valuation!: StockValuation;
}

/** One valuation row in a lot's history. */
export class LotCostEntry {
  id!: string;
  kind!: ValuationKind;
  /** The movement's reason; null for an opening balance. */
  reason!: string | null;
  /** Signed: negative for stock leaving. */
  quantity!: string;
  value!: string;
  unitPrice!: string | null;
  currency!: string | null;
  exchangeRate!: string | null;
  needsCost!: boolean;
  referenceType!: string | null;
  referenceId!: string | null;
  createdAt!: Date;
}

/** What one lot is worth, and how it got there. */
export class LotCost {
  currency!: string | null;
  lotId!: string;
  lotCode!: string;
  sku!: string;
  quantity!: string;
  value!: string;
  /** Null when none is on hand. */
  unitCost!: string | null;
  provisional!: boolean;
  entries!: LotCostEntry[];
}

/** GET /costs/lots/:id. */
export class LotCostEnvelope {
  lotCost!: LotCost;
}

/** One material a batch consumed. */
export class RunCostConsumed {
  sku!: string;
  lotCode!: string | null;
  quantity!: string;
  value!: string;
}

/** One lot a batch produced, and what it was valued at. */
export class RunCostOutput {
  lotCode!: string | null;
  quantity!: string;
  value!: string;
}

/** What one batch cost to make: material only. */
export class RunCost {
  currency!: string | null;
  runId!: string;
  reference!: string | null;
  sku!: string;
  status!: 'draft' | 'released' | 'completed' | 'cancelled';
  closed!: boolean;
  quantityProduced!: string;
  /** Null until the run closes; consumption is written then. */
  materialCost!: string | null;
  /** Null until close, and when nothing was made. */
  unitCost!: string | null;
  provisional!: boolean;
  consumed!: RunCostConsumed[];
  outputs!: RunCostOutput[];
}

/** GET /costs/runs/:id. */
export class RunCostEnvelope {
  runCost!: RunCost;
}

/** A valuation still waiting for a cost: the to-do list. */
export class NeedsCostEntry {
  id!: string;
  kind!: ValuationKind;
  /** The movement's reason; null for the opening balance. */
  reason!: string | null;
  sku!: string;
  variantId!: string;
  lotId!: string | null;
  lotCode!: string | null;
  quantity!: string;
  /** Set when a price is known but its rate is not. */
  unitPrice!: string | null;
  currency!: string | null;
  referenceType!: string | null;
  referenceId!: string | null;
  createdAt!: Date;
}

/** GET /costs/needs-cost: one page, newest first. */
export class NeedsCostPage {
  entries!: NeedsCostEntry[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** A cost set on a valuation, and what it changed. */
export class CorrectedCost {
  valuationId!: string;
  /** What the acquisition is now worth in total, in the base currency. */
  value!: string;
  /** The change applied to stock still in the pool. */
  held!: string;
  /** The change recorded against stock already gone. */
  issued!: string;
}

/** PUT /costs/valuations/:id. */
export class CorrectedCostEnvelope {
  cost!: CorrectedCost;
}

/** One currency's rate into the base currency, for one day. */
export class ExchangeRate {
  id!: string;
  currency!: string;
  /** YYYY-MM-DD. */
  rateDate!: string;
  rate!: string;
}

/** GET /costs/exchange-rates. */
export class ExchangeRateList {
  rates!: ExchangeRate[];
}

/** PUT /costs/exchange-rates: the rate as stored. */
export class ExchangeRateEnvelope {
  rate!: ExchangeRate;
}
