import { ApiProperty } from '@nestjs/swagger';

import {
  LOT_EXPIRIES,
  type LotExpiry,
  type OrderDirection,
  type ProductType,
} from '../../../database/schema';
import type { OrderFulfillment } from '../../orders/order-fulfillment';
import type { LookupKind } from '../lookup.service';

/**
 * The top bar's lookup as the API returns it (ADR-068, ADR-056),
 * described for the OpenAPI document by the CLI plugin.
 */

/** One record the lookup found; the client builds its address. */
export class LookupResult {
  id!: string;
  title!: string;
  detail!: string | null;
  status!: string | null;
  /** An order's direction, for its status's words; null for other kinds. */
  direction!: OrderDirection | null;
  /** How much of a confirmed order has come or gone (#605); null for other kinds. */
  fulfillment!: OrderFulfillment | null;
  /** A calendar day, YYYY-MM-DD (ADR-052). */
  expiresAt!: string | null;
  /**
   * A lot's expiry: a date, not known yet, or none (ADR-094, R9); null for
   * other kinds.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, nullable: true })
  expiry!: LotExpiry | null;
  /**
   * A lot's supplier's lot, which finds it as its code does (ADR-094, R6);
   * null for other kinds and for a lot with none.
   */
  supplierLot!: string | null;
  /** Whether a lot's code was made here (ADR-094, R5); null for other kinds. */
  isAssigned!: boolean | null;
  /**
   * The former code a lot was found by, for "was {code}" (ADR-094
   * amended, R9): typed whole first, then the latest. Null where the
   * lot's code today matches too, for a close match, and for other kinds.
   */
  formerCode!: string | null;
  productId!: string | null;
  /** An item's product's cover (ADR-066); null for other kinds. */
  coverFileId!: string | null;
  /** An item's type, for its icon where it has no cover (#546); null for other kinds. */
  type!: ProductType | null;
  /** Found by similarity, after the exact matches: a typo. */
  close!: boolean;
}

export class LookupGroup {
  kind!: LookupKind;
  results!: LookupResult[];
}

/** GET /lookup: the kinds in the order to show them. */
export class LookupResponse {
  groups!: LookupGroup[];
}
