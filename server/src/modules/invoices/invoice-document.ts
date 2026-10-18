import type { Content } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type {
  Drawing,
  Printable,
} from '../../core/documents/documents.service';
import { fontFor } from '../../core/documents/fonts';
import { formatDay } from '../../core/documents/format';
import {
  banner,
  kindAndNumber,
  linesTable,
  masthead,
  party,
  run,
  sellerParty,
  sideBySide,
  totals,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
import { fileNameOf } from '../numbering/numbering-format';
import type { InvoiceDetail } from './dto/invoice-response.dto';

const TITLE = t({ id: 'documents.invoice', defaultMessage: 'Invoice' });
const DRAFT_MARK = t({ id: 'documents.draftMark', defaultMessage: 'DRAFT' });

/**
 * An invoice as a PDF (ADR-071), as its print page laid it out (ADR-046,
 * ADR-055).
 *
 * An issued invoice is drawn from what was stored at issue, its number,
 * amounts and both parties as they were that day, so one drawn in a year
 * reads as the original did. A draft is drawn too, for someone to check
 * before issuing, marked DRAFT on every page, with no number; its seller
 * and bill-to are not copied until issue, so it shows only the customer's
 * name. A voided invoice says VOID, and why.
 */
export function invoiceDocument(
  invoice: InvoiceDetail,
  doc: DocumentText,
): Drawing {
  const isDraft = invoice.status === 'draft';
  const day = (value: string) => formatDay(value, doc.locale);

  const content: Content[] = [];

  if (isDraft) {
    content.push(
      banner(
        doc.label(
          t({
            id: 'documents.draft',
            defaultMessage: 'DRAFT — not an invoice',
          }),
        ),
        doc.lines(
          t({
            id: 'documents.draft.detail',
            defaultMessage:
              'Not yet issued: it has no number and nothing is owed on it.',
          }),
        ),
      ),
    );
  }

  if (invoice.status === 'voided') {
    content.push(
      banner(
        doc.label(
          t({
            id: 'documents.invoice.void',
            defaultMessage: 'VOID — nothing is owed on this invoice',
          }),
        ),
        doc.lines(
          t(
            {
              id: 'documents.invoice.voidDetail',
              defaultMessage:
                'Voided {date}: {reason}{credits, select, none {} other { — reversed by {credits}}}',
            },
            {
              // When it was voided, in the organization's zone (ADR-072).
              date: invoice.voidedAt ? doc.dayOf(invoice.voidedAt) : '',
              reason: invoice.voidReason ?? '',
              credits:
                invoice.creditNotes.length > 0
                  ? invoice.creditNotes.map((note) => note.number).join(', ')
                  : 'none',
            },
          ),
        ),
      ),
    );
  }

  content.push(
    masthead(
      doc.label(TITLE),
      invoice.number ? run(invoice.number, { fontSize: 15, bold: true }) : null,
      [
        invoice.invoiceDate &&
          doc.label(
            t(
              { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
              { date: day(invoice.invoiceDate) },
            ),
          ),
        invoice.dueDate &&
          doc.label(
            t(
              { id: 'documents.dueOn', defaultMessage: 'Due {date}' },
              { date: day(invoice.dueDate) },
            ),
          ),
        invoice.orderReference &&
          doc.label(
            t(
              {
                id: 'documents.yourOrder',
                defaultMessage: 'Your order {reference}',
              },
              { reference: invoice.orderReference },
            ),
          ),
      ],
    ),
  );

  const parties: Content[] = [
    sellerParty(
      doc,
      invoice.sellerName,
      [
        invoice.sellerLine1,
        invoice.sellerLine2,
        invoice.sellerCity,
        invoice.sellerRegion,
        invoice.sellerPostalCode,
        invoice.sellerCountry,
      ],
      invoice.sellerTaxNumber,
    ),
    party(
      doc.label(t({ id: 'documents.billTo', defaultMessage: 'Bill to' })),
      invoice.billToName ?? invoice.partnerName,
      [
        invoice.billToLine1,
        invoice.billToLine2,
        invoice.billToCity,
        invoice.billToRegion,
        invoice.billToPostalCode,
        invoice.billToCountry,
      ],
    ),
  ];
  if (invoice.shipToLine1) {
    parties.push(
      party(
        doc.label(
          t({ id: 'documents.shippedTo', defaultMessage: 'Shipped to' }),
        ),
        invoice.shipToLabel,
        [
          invoice.shipToLine1,
          invoice.shipToLine2,
          invoice.shipToCity,
          invoice.shipToRegion,
          invoice.shipToPostalCode,
          invoice.shipToCountry,
        ],
      ),
    );
  }
  content.push(sideBySide(parties));

  // A draft's amounts are its preview: nothing is stored until issue.
  const amounts = isDraft ? invoice.preview : invoice;
  const netOf = (lineId: string, stored: string | null) =>
    isDraft
      ? (invoice.preview?.lines.find((row) => row.id === lineId)?.netAmount ??
        null)
      : stored;

  content.push(
    linesTable(
      doc,
      invoice.currency,
      invoice.lines.map((line) => ({
        ...line,
        netAmount: netOf(line.id, line.netAmount),
      })),
    ),
    totals(
      doc,
      invoice.currency,
      amounts?.subtotal ?? null,
      amounts?.taxes ?? [],
      amounts?.total ?? null,
      t({ id: 'documents.total', defaultMessage: 'Total' }),
    ),
  );

  if (invoice.note) content.push(run(invoice.note, { fontSize: 10.5 }));

  // DRAFT on every page, not only the first, under what is printed.
  const draftMark = doc.label(DRAFT_MARK);

  return {
    info: { title: invoice.number ?? draftMark },
    content,
    ...(isDraft
      ? {
          watermark: {
            text: draftMark,
            font: fontFor(draftMark),
            opacity: 0.08,
            bold: true,
          },
        }
      : {}),
  };
}

/**
 * The invoice for its PDF route, named by its number, or DRAFT and the
 * start of its id.
 */
export function printableInvoice(invoice: InvoiceDetail): Printable {
  return {
    language: invoice.language,
    secondLanguage: invoice.secondLanguage,
    // Copied at issue; a draft has copied none yet, so it takes the
    // organization's as it is now.
    sellerCountry: invoice.sellerCountry,
    name: () =>
      invoice.number
        ? `${fileNameOf(invoice.number)}.pdf`
        : `DRAFT ${invoice.id.slice(0, 8)}.pdf`,
    which: (doc) =>
      kindAndNumber(doc.label(TITLE), invoice.number ?? doc.label(DRAFT_MARK)),
    draw: (doc) => invoiceDocument(invoice, doc),
  };
}
