import { ApiProperty } from '@nestjs/swagger';

import type { ProductType, ValuationKind } from '../../../database/schema';

/**
 * Which way a late cost went by a lot change, as a lot's history reads it
 * (ADR-094, D5): `to` the other lot, carried on with the stock moved, or
 * `from` it, come with the stock moved in.
 */
export const COST_CARRIED = ['to', 'from'] as const;

export type CostCarried = (typeof COST_CARRIED)[number];

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
  /** Signed: negative for stock leaving, a lot change's row out too. */
  quantity!: string;
  value!: string;
  unitPrice!: string | null;
  currency!: string | null;
  exchangeRate!: string | null;
  needsCost!: boolean;
  referenceType!: string | null;
  referenceId!: string | null;
  /**
   * A lot change's other lot (ADR-094): the lot its row out went to, or
   * the lot its row in came from, none for stock from before lot
   * tracking. For a late cost carried by a lot change, the lot it went to
   * or came from, as `carried` says. Null for any other row.
   */
  otherLotId!: string | null;
  otherLotCode!: string | null;
  /**
   * A late cost carried by a lot change (ADR-094, D5): `to` where this
   * lot's part went on to the other lot, `from` where it came from it.
   * Null for every other row.
   */
  @ApiProperty({ enum: COST_CARRIED, nullable: true })
  carried!: CostCarried | null;
  /**
   * A return with no cost it shipped at, valued at its pool's average when
   * it came back (#661): the row says so.
   */
  atPoolAverage!: boolean;
  /** Whether Set cost takes a cost on this row, the server's rule (#669's 58). */
  takesCost!: boolean;
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
  /**
   * The movement's detail under its reason, as Movements sends it: for a
   * lot change, `between_lots` (ADR-094). Null with none.
   */
  reasonDetail!: string | null;
  sku!: string;
  variantId!: string;
  /** The item's page, which its name opens (#296). */
  productId!: string;
  /** The item's names in the reader's language (ADR-056, #296). */
  productName!: string;
  variantName!: string | null;
  /** The item's type and cover, for its icon or picture (#546). */
  type!: ProductType;
  coverFileId!: string | null;
  lotId!: string | null;
  lotCode!: string | null;
  /**
   * The lot a lot change's stock came from, which still waits for a cost
   * (ADR-094, 3a): Stock value names it. Null for every other row, and
   * for stock from before lot tracking.
   */
  fromLotId!: string | null;
  fromLotCode!: string | null;
  quantity!: string;
  /** Set when a price is known but its rate is not. */
  unitPrice!: string | null;
  currency!: string | null;
  referenceType!: string | null;
  referenceId!: string | null;
  /**
   * Whether Set cost takes a cost on this row, the server's rule (#669's
   * 58): false for a batch's output and for stock a lot change moved in.
   */
  takesCost!: boolean;
  createdAt!: Date;
}

/** GET /costs/needs-cost: one page, newest first. */
export class NeedsCostPage {
  entries!: NeedsCostEntry[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/**
 * A lot a cost followed stock moved to (ADR-094, D5), and what of the
 * change ended there, held or already gone.
 */
export class FollowedCost {
  lotId!: string;
  lotCode!: string;
  value!: string;
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
  /**
   * The lots the change followed stock moved to before it was given, in
   * the order reached; with held and issued, they add up to the change.
   * Empty where none of it moved.
   */
  followed!: FollowedCost[];
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
