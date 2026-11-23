import { ApiProperty } from '@nestjs/swagger';

import {
  type InvoiceStatus,
  LOT_EXPIRIES,
  type LotExpiry,
  type OrderDirection,
  type OrderStatus,
  type ProductType,
} from '../../../database/schema';
import type { ChosenSite } from '../../locations/dto/location-response.dto';
import type { OrderFulfillment } from '../order-fulfillment';

/**
 * Orders as the API returns them (ADR-068): the fields the client reads,
 * described for the OpenAPI document by the CLI plugin, from which the
 * client's types are generated.
 */

/** A row of the order list. */
export class OrderSummary {
  id!: string;
  /** Ours, SO- or PO- (ADR-071). */
  number!: string;
  partnerId!: string;
  partnerName!: string;
  direction!: OrderDirection;
  /** A sale sent as a sample (ADR-042). Always false on a purchase. */
  isSample!: boolean;
  status!: OrderStatus;
  reference!: string | null;
  expectedAt!: string | null;
  createdAt!: Date;
  lineCount!: number;
  /** numeric(18,4) as a string, never parsed into a number (ADR-025). */
  quantityOrdered!: string;
  quantityFulfilled!: string;
  /**
   * How much has come or gone while the order is confirmed (#605): none,
   * part or all, a line closed short counting as done. Null on any other
   * status. Beside Status, never instead of it (ADR-027).
   */
  fulfillment!: OrderFulfillment | null;
}

/** GET /orders: one page, newest first or sorted (ADR-057). */
export class OrderPage {
  entries!: OrderSummary[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

export class OrderLine {
  id!: string;
  variantId!: string;
  /** Snapshotted when the order was raised (ADR-023). */
  sku!: string;
  description!: string;
  /**
   * The item's, read live as receiving needs them (ADR-080): whether a
   * receipt names a lot, and what its quantities count in. On the line, so
   * receiving asks nothing of the catalogue (products.view).
   */
  tracksLots!: boolean;
  unitOfMeasure!: string;
  quantityOrdered!: string;
  quantityFulfilled!: string;
  /** Customer returns, beside fulfilled rather than subtracted (ADR-043). */
  quantityReturned!: string;
  /** Credited on a credit note, voiding's left out (ADR-055). */
  quantityCredited!: string;
  /** On returns with no RMA yet (ADR-047). Zero on a purchase or sample. */
  quantityUnsettled!: string;
  quantityOutstanding!: string;
  /**
   * The price and what it came to, absent for a reader without
   * orders.view_prices (ADR-080), as are the four fields below.
   */
  unitPrice?: string | null;
  currency?: string | null;
  /** Where the price came from (ADR-049): a list, typed, or not yet priced. */
  priceSource?: 'list' | 'manual' | null;
  priceListId?: string | null;
  priceListName?: string | null;
  lineTotal?: string | null;
  isComplete!: boolean;
  /** No more is coming (ADR-034). The quantities stay as they were. */
  isClosedShort!: boolean;
  closedReason!: string | null;
}

/** One currency's total of an order's priced lines. */
export class OrderTotal {
  currency!: string;
  amount!: string;
}

/** A sale's money (ADR-055), summed by the server, never on the client. */
export class OrderMoney {
  currency!: string | null;
  invoiced!: string;
  credited!: string;
  netInvoiced!: string;
  /**
   * The lines' prices not yet billed: absent for a reader without
   * orders.view_prices (ADR-080).
   */
  notInvoiced?: string;
}

/** How many records each of an order's tabs holds. */
export class OrderCounts {
  shipments!: number;
  voidedShipments!: number;
  returns!: number;
  /** Invoices and credit notes: absent without invoices.view (ADR-080). */
  documents?: number;
}

/** An order's quantities summed, when every line counts in one unit. */
export class OrderQuantities {
  unit!: string;
  ordered!: string;
  fulfilled!: string;
  returned!: string;
  outstanding!: string;
}

/** An invoice on a sale, as its "Invoices and credits" tab lists it. */
export class OrderInvoiceRow {
  id!: string;
  /** Null on a draft: a number is given at issue (ADR-046). */
  number!: string | null;
  status!: InvoiceStatus;
  date!: string | null;
  total!: string | null;
  currency!: string;
  /** When the shipment it bills left. */
  shippedAt!: Date;
  quantity!: string;
}

/** A credit note on a sale's invoice, for the same tab. Always issued. */
export class OrderCreditRow {
  id!: string;
  number!: string;
  date!: string;
  total!: string;
  currency!: string;
  reason!: string;
  /** The full credit that voided an invoice (ADR-046). */
  isVoid!: boolean;
  invoiceNumber!: string | null;
  quantity!: string;
}

export class OrderDocuments {
  invoices!: OrderInvoiceRow[];
  creditNotes!: OrderCreditRow[];
}

export class OrderDetail {
  id!: string;
  /** Ours, SO- or PO- (ADR-071); `reference` is theirs. */
  number!: string;
  partnerId!: string;
  partnerName!: string;
  direction!: OrderDirection;
  isSample!: boolean;
  /** Every line received or shipped, or closed short. */
  fullyFulfilled!: boolean;
  /** As the list's row has it (#605): null unless confirmed. */
  fulfillment!: OrderFulfillment | null;
  /** Set when this order was raised by duplicating another (ADR-031). */
  duplicatedFromId!: string | null;
  status!: OrderStatus;
  reference!: string | null;
  expectedAt!: string | null;
  note!: string | null;
  /**
   * Where a purchase is delivered (ADR-071, amended). Null on a sale, and
   * on a purchase nobody chose a site for, which prints the registered
   * address.
   */
  deliverTo!: ChosenSite | null;
  /** Absent, with totalsComplete, without orders.view_prices (ADR-080). */
  totals?: OrderTotal[];
  totalsComplete?: boolean;
  /**
   * Null on a purchase or a sample: neither is invoiced here. Absent, as
   * documents are, for a reader without invoices.view (ADR-080).
   */
  money?: OrderMoney | null;
  /** Returns received with no RMA, nobody yet deciding what they settle. */
  unsettledReturns!: number;
  counts!: OrderCounts;
  /** Null when the lines count in different units. */
  quantities!: OrderQuantities | null;
  /** A sale's invoices and credit notes; null on a purchase or sample. */
  documents?: OrderDocuments | null;
  lines!: OrderLine[];
}

/** Creating or duplicating an order: the order as it is now. */
export class OrderEnvelope {
  order!: OrderDetail;
}

/**
 * A line just added, as the order's detail shows it, with a word on its
 * price when the list had none.
 */
export class AddedOrderLine extends OrderLine {
  /** Not stored: it explains this response, not the line (ADR-049). */
  priceNotice?: string;
}

/** POST /orders/:id/lines. */
export class AddedOrderLineEnvelope {
  line!: AddedOrderLine;
}

/** The stock movement a receipt wrote (ADR-023). */
export class ReceivedMovement {
  id!: string;
  /** The lot it went into, which the message opens; null with none. */
  lotId!: string | null;
}

/** POST /orders/:id/lines/:lineId/receipts. */
export class ReceiptEnvelope {
  movement!: ReceivedMovement;
  /** The receipt waits for a cost, as a line with no price does (ADR-048). */
  needsCost!: boolean;
  /**
   * The lot's code, for the message to name: one made for us when the
   * write was saved, which the receiver writes on the delivery (ADR-094,
   * R3); null with no lot.
   */
  lotCode!: string | null;
}

/**
 * A receipt on a purchase, as its Receipts tab lists it (ADR-093, 102a):
 * When, Item, Received, Lot and By, for a reader with orders.view, read
 * as Movements lists the order, so the two never differ.
 */
export class OrderReceipt {
  id!: string;
  /** When it was recorded. */
  createdAt!: Date;
  /** Its item, whose page the row's name opens. */
  productId!: string;
  /** The code it was received under, snapshotted then (ADR-023). */
  sku!: string;
  /** The code today: "was …" under it when `sku` differs (7a). */
  currentSku!: string;
  /** In the reader's language (ADR-056). */
  productName!: string;
  variantName!: string | null;
  type!: ProductType;
  unitOfMeasure!: string;
  /** How much came in. */
  received!: string;
  /**
   * Where it went: its name, code and path only for a reader with
   * `locations.view`, null and empty otherwise, its id kept (96a).
   */
  toLocationId!: string | null;
  toLocationName!: string | null;
  toLocationCode!: string | null;
  /** The places above it, its warehouse or site first (57a). */
  toLocationPath!: string[];
  lotId!: string | null;
  lotCode!: string | null;
  /** `YYYY-MM-DD` (ADR-052); null with none. */
  lotExpiresAt!: string | null;
  /**
   * The lot's kind of expiry, so one not known yet reads "Expiry to add"
   * (ADR-094, R9); null with no lot.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, nullable: true })
  lotExpiry!: LotExpiry | null;
  /** Who, by name (ADR-063): Deleted User once anonymised (ADR-012). */
  actorName!: string | null;
  /** Null when the actor was anonymised (ADR-012). */
  actorEmail!: string | null;
}

/** GET /orders/:id/receipts: one page, newest first. */
export class OrderReceiptPage {
  entries!: OrderReceipt[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/**
 * The line a delivery is, as receiving it needs it: the receive-line
 * dialog's fields, OrderLine's own.
 */
export class DeliveryLine {
  id!: string;
  variantId!: string;
  /** Snapshotted when the order was raised (ADR-023). */
  sku!: string;
  tracksLots!: boolean;
  unitOfMeasure!: string;
  quantityOrdered!: string;
  quantityFulfilled!: string;
  quantityOutstanding!: string;
}

/**
 * A delivery an item's receipt may be (ADR-093, v3): a confirmed
 * purchase's line still to come, as Coming counts it (availability.ts's
 * comingOf), with its order, its supplier and the day it is expected.
 */
export class Delivery {
  orderId!: string;
  /** Ours, PO- (ADR-071). */
  number!: string;
  partnerName!: string;
  expectedAt!: string | null;
  /** Expected before the organization's today (ADR-072). */
  late!: boolean;
  line!: DeliveryLine;
}
