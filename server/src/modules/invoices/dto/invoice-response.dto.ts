import type { Locale } from '../../../common/locales';
import type { InvoiceStatus } from '../../../database/schema';

/**
 * Invoices as the API returns them (ADR-068): what the client reads, and
 * nothing it does not, such as the organization an invoice belongs to or
 * who issued it. The CLI plugin describes each property from its type for
 * the OpenAPI document, and the client's types are generated from that.
 */

/** Who issued a document and who it is addressed to, as copied at issue. */
export class DocumentParties {
  sellerName!: string | null;
  sellerTaxNumber!: string | null;
  sellerLine1!: string | null;
  sellerLine2!: string | null;
  sellerCity!: string | null;
  sellerRegion!: string | null;
  sellerPostalCode!: string | null;
  sellerCountry!: string | null;
  billToName!: string | null;
  billToLine1!: string | null;
  billToLine2!: string | null;
  billToCity!: string | null;
  billToRegion!: string | null;
  billToPostalCode!: string | null;
  billToCountry!: string | null;
}

/** A row of the invoice list. The amounts are null until issued. */
export class InvoiceSummary {
  id!: string;
  number!: string | null;
  status!: InvoiceStatus;
  orderId!: string;
  /** The order's own number, SO- (ADR-071); the reference is theirs. */
  orderNumber!: string;
  orderReference!: string | null;
  shipmentId!: string;
  partnerId!: string;
  partnerName!: string;
  currency!: string;
  invoiceDate!: string | null;
  dueDate!: string | null;
  subtotal!: string | null;
  taxTotal!: string | null;
  total!: string | null;
  /** Every credit note against it, the voiding one included. */
  credited!: string;
  /** What is left after the credits; null on a draft. */
  net!: string | null;
  createdAt!: Date;
}

/** GET /invoices: one page, newest first or sorted (ADR-057). */
export class InvoicePage {
  entries!: InvoiceSummary[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

export class InvoiceLine {
  id!: string;
  orderLineId!: string;
  variantId!: string;
  sku!: string;
  description!: string;
  /** The name in the second language, copied at issue (ADR-054). */
  secondDescription!: string | null;
  quantity!: string;
  unitPrice!: string;
  taxCodeId!: string | null;
  /** The live code name on a draft; the copy made at issue after that. */
  taxCodeName!: string | null;
  /** Stored at issue; null on a draft, whose figures are in `preview`. */
  netAmount!: string | null;
}

/** One tax line: summed per component and rounded once (ADR-046). */
export class InvoiceTax {
  name!: string;
  rate!: string;
  taxableAmount!: string;
  amount!: string;
}

export class InvoiceAmountsLine {
  id!: string;
  netAmount!: string;
}

/** A draft's figures, computed the way issuing will store them. */
export class InvoiceAmounts {
  lines!: InvoiceAmountsLine[];
  taxes!: InvoiceTax[];
  subtotal!: string;
  taxTotal!: string;
  total!: string;
}

/** A credit note against an invoice, as the invoice's page lists it. */
export class InvoiceCreditNote {
  id!: string;
  number!: string;
  creditDate!: string;
  reason!: string;
  isVoid!: boolean;
  total!: string;
}

export class InvoiceDetail extends DocumentParties {
  id!: string;
  number!: string | null;
  status!: InvoiceStatus;
  orderId!: string;
  /** The order's own number, SO- (ADR-071); the reference is theirs. */
  orderNumber!: string;
  orderReference!: string | null;
  shipmentId!: string;
  partnerId!: string;
  partnerName!: string;
  currency!: string;
  invoiceDate!: string | null;
  dueDate!: string | null;
  note!: string | null;
  subtotal!: string | null;
  taxTotal!: string | null;
  total!: string | null;
  shipToLabel!: string | null;
  shipToLine1!: string | null;
  shipToLine2!: string | null;
  shipToCity!: string | null;
  shipToRegion!: string | null;
  shipToPostalCode!: string | null;
  shipToCountry!: string | null;
  issuedAt!: Date | null;
  voidedAt!: Date | null;
  voidReason!: string | null;
  lines!: InvoiceLine[];
  /** Stored tax lines once issued; null on a draft. */
  taxes!: InvoiceTax[] | null;
  /** A draft's figures; null once issued. */
  preview!: InvoiceAmounts | null;
  creditNotes!: InvoiceCreditNote[];
  /**
   * What it prints in (ADR-054): stored at issue, and for a draft the pair
   * it would take today, so a draft's printout is the issued one's.
   */
  language!: Locale;
  secondLanguage!: Locale | null;
}

/** GET /invoices/:id, and creating or issuing one: the invoice as it is now. */
export class InvoiceEnvelope {
  invoice!: InvoiceDetail;
}
