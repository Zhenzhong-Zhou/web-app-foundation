import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import { formatDay } from '../../core/documents/format';
import { fontFor } from '../../core/documents/pdf-renderer.service';
import {
  banner,
  GAP,
  linesTable,
  logo,
  party,
  run,
  totals,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
import type { InvoiceDetail } from './dto/invoice-response.dto';

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
  logoDataUrl: string | null,
): TDocumentDefinitions {
  const isDraft = invoice.status === 'draft';
  const day = (value: string | Date) => formatDay(value, doc.locale);
  const smallRight = (text: string) =>
    run(text, { fontSize: 10.5, alignment: 'right' });

  const content: Content[] = [];
  if (logoDataUrl) content.push(logo(logoDataUrl));

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
              date: invoice.voidedAt ? day(invoice.voidedAt) : '',
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

  const dates: Content[] = [];
  if (invoice.invoiceDate) {
    dates.push(
      smallRight(
        doc.label(
          t(
            { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
            { date: day(invoice.invoiceDate) },
          ),
        ),
      ),
    );
  }
  if (invoice.dueDate) {
    dates.push(
      smallRight(
        doc.label(
          t(
            { id: 'documents.dueOn', defaultMessage: 'Due {date}' },
            { date: day(invoice.dueDate) },
          ),
        ),
      ),
    );
  }
  if (invoice.orderReference) {
    dates.push(
      smallRight(
        doc.label(
          t(
            {
              id: 'documents.yourOrder',
              defaultMessage: 'Your order {reference}',
            },
            { reference: invoice.orderReference },
          ),
        ),
      ),
    );
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          run(
            doc.label(
              t({ id: 'documents.invoice', defaultMessage: 'Invoice' }),
            ),
            { fontSize: 18 },
          ),
          ...(invoice.number
            ? [run(invoice.number, { fontSize: 15, bold: true })]
            : []),
        ],
      },
      { width: 'auto', stack: dates },
    ],
    margin: [0, 0, 0, GAP],
  });

  const parties: Content[] = [
    party(
      doc.label(t({ id: 'documents.from', defaultMessage: 'From' })),
      invoice.sellerName,
      [
        invoice.sellerLine1,
        invoice.sellerLine2,
        invoice.sellerCity,
        invoice.sellerRegion,
        invoice.sellerPostalCode,
        invoice.sellerCountry,
      ],
      invoice.sellerTaxNumber
        ? [
            run(
              doc.label(
                t(
                  {
                    id: 'documents.taxRegistration',
                    defaultMessage: 'Tax registration {number}',
                  },
                  { number: invoice.sellerTaxNumber },
                ),
              ),
              { fontSize: 10.5 },
            ),
          ]
        : [],
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
  content.push({ columns: parties, columnGap: 36, margin: [0, 0, 0, GAP] });

  // A draft's amounts are its preview: nothing is stored until issue.
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
        sku: line.sku,
        description: line.description,
        secondDescription: line.secondDescription,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxCodeName: line.taxCodeName,
        amount: netOf(line.id, line.netAmount),
      })),
    ),
    totals(
      doc,
      invoice.currency,
      isDraft ? (invoice.preview?.subtotal ?? null) : invoice.subtotal,
      (isDraft ? invoice.preview?.taxes : invoice.taxes) ?? [],
      isDraft ? (invoice.preview?.total ?? null) : invoice.total,
      t({ id: 'documents.total', defaultMessage: 'Total' }),
    ),
  );

  if (invoice.note) content.push(run(invoice.note, { fontSize: 10.5 }));

  // DRAFT on every page, not only the first, under what is printed.
  const draftMark = doc.label(
    t({ id: 'documents.draftMark', defaultMessage: 'DRAFT' }),
  );

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

/** The file's name: the invoice's number, or DRAFT and the start of its id. */
export function invoiceFileName(invoice: InvoiceDetail): string {
  return invoice.number
    ? `${invoice.number}.pdf`
    : `DRAFT ${invoice.id.slice(0, 8)}.pdf`;
}
