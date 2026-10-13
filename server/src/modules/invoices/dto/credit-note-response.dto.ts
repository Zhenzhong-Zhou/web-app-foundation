import type { Locale } from '../../../common/locales';
import {
  DocumentParties,
  type InvoiceDetail,
  type InvoiceTax,
} from './invoice-response.dto';

/**
 * Credit notes as the API returns them (ADR-068), on the same terms as
 * invoice-response.dto.ts: the fields the client reads, described for the
 * OpenAPI document by the CLI plugin.
 */

/** A row of the credit notes list (ADR-057). */
export class CreditNoteSummary {
  id!: string;
  number!: string;
  invoiceId!: string;
  invoiceNumber!: string | null;
  partnerId!: string;
  partnerName!: string;
  currency!: string;
  creditDate!: string;
  total!: string;
  isVoid!: boolean;
}

/** GET /credit-notes: one page, newest first. */
export class CreditNotePage {
  entries!: CreditNoteSummary[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

export class CreditNoteLine {
  id!: string;
  invoiceLineId!: string;
  sku!: string;
  description!: string;
  secondDescription!: string | null;
  quantity!: string;
  unitPrice!: string;
  taxCodeName!: string | null;
  netAmount!: string;
}

export class CreditNoteDetail extends DocumentParties {
  id!: string;
  number!: string;
  invoiceId!: string;
  invoiceNumber!: string | null;
  invoiceDate!: string | null;
  currency!: string;
  creditDate!: string;
  reason!: string;
  isVoid!: boolean;
  subtotal!: string;
  taxTotal!: string;
  total!: string;
  lines!: CreditNoteLine[];
  taxes!: InvoiceTax[];
  /** Its invoice's languages, copied when it was issued (ADR-054). */
  language!: Locale;
  secondLanguage!: Locale | null;
}

/** GET /credit-notes/:id, and issuing one: the credit note as stored. */
export class CreditNoteEnvelope {
  creditNote!: CreditNoteDetail;
}

/** POST /invoices/:id/void: the invoice, now voided, and its credit note. */
export class VoidedInvoice {
  invoice!: InvoiceDetail;
  creditNote!: CreditNoteDetail;
}

/** One requested line of a credit, checked and priced. */
export class CreditPreviewLine {
  invoiceLineId!: string;
  returnAuthorizationLineId!: string | null;
  sku!: string;
  description!: string;
  secondDescription!: string | null;
  taxCodeName!: string | null;
  quantity!: string;
  unitPrice!: string;
  netAmount!: string;
}

/** What a credit would come to, computed as issuing will store it. */
export class CreditPreview {
  lines!: CreditPreviewLine[];
  taxes!: InvoiceTax[];
  subtotal!: string;
  taxTotal!: string;
  total!: string;
}

/** POST /invoices/:id/credit-notes/preview. */
export class CreditPreviewEnvelope {
  credit!: CreditPreview;
}
