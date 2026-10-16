import type {
  InvoiceStatus,
  OrderDirection,
  OrderStatus,
} from '../../../database/schema';

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
  quantityOrdered!: string;
  quantityFulfilled!: string;
  /** Customer returns, beside fulfilled rather than subtracted (ADR-043). */
  quantityReturned!: string;
  /** Credited on a credit note, voiding's left out (ADR-055). */
  quantityCredited!: string;
  /** On returns with no RMA yet (ADR-047). Zero on a purchase or sample. */
  quantityUnsettled!: string;
  quantityOutstanding!: string;
  unitPrice!: string | null;
  currency!: string | null;
  /** Where the price came from (ADR-049): a list, typed, or not yet priced. */
  priceSource!: 'list' | 'manual' | null;
  priceListId!: string | null;
  priceListName!: string | null;
  lineTotal!: string | null;
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
  notInvoiced!: string;
}

/** How many records each of an order's tabs holds. */
export class OrderCounts {
  shipments!: number;
  voidedShipments!: number;
  returns!: number;
  documents!: number;
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
  /** Set when this order was raised by duplicating another (ADR-031). */
  duplicatedFromId!: string | null;
  status!: OrderStatus;
  reference!: string | null;
  expectedAt!: string | null;
  note!: string | null;
  totals!: OrderTotal[];
  totalsComplete!: boolean;
  /** Null on a purchase or a sample: neither is invoiced here. */
  money!: OrderMoney | null;
  /** Returns received with no RMA, nobody yet deciding what they settle. */
  unsettledReturns!: number;
  counts!: OrderCounts;
  /** Null when the lines count in different units. */
  quantities!: OrderQuantities | null;
  /** A sale's invoices and credit notes; null on a purchase or sample. */
  documents!: OrderDocuments | null;
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
}

/** POST /orders/:id/lines/:lineId/receipts. */
export class ReceiptEnvelope {
  movement!: ReceivedMovement;
}
