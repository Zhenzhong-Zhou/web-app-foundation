import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import { formatDay } from '../../core/documents/format';
import {
  GAP,
  linesTable,
  logo,
  party,
  run,
  totals,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
import type { CreditNoteDetail } from './dto/credit-note-response.dto';

/**
 * A credit note as a PDF (ADR-071): the invoice's layout, as its print page
 * had it (ADR-046), stating what is given back and which invoice it
 * reverses. Amounts print positive, since a credit note says what it
 * credits, not a negative invoice, and the reason prints, because the
 * customer reads it too.
 */
export function creditNoteDocument(
  note: CreditNoteDetail,
  doc: DocumentText,
  logoDataUrl: string | null,
): TDocumentDefinitions {
  const day = (value: string) => formatDay(value, doc.locale);
  const smallRight = (text: string) =>
    run(text, { fontSize: 10.5, alignment: 'right' });

  const content: Content[] = [];
  if (logoDataUrl) content.push(logo(logoDataUrl));

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          run(
            doc.label(
              t({ id: 'documents.creditNote', defaultMessage: 'Credit note' }),
            ),
            { fontSize: 18 },
          ),
          run(note.number, { fontSize: 15, bold: true }),
        ],
      },
      {
        width: 'auto',
        stack: [
          smallRight(
            doc.label(
              t(
                { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
                { date: day(note.creditDate) },
              ),
            ),
          ),
          smallRight(
            doc.label(
              t(
                {
                  id: 'documents.creditNote.against',
                  defaultMessage:
                    '{kind, select, void {Voids} other {Credits}} invoice {number}{date, select, none {} other { of {date}}}',
                },
                {
                  kind: note.isVoid ? 'void' : 'credit',
                  number: note.invoiceNumber ?? '',
                  date: note.invoiceDate ? day(note.invoiceDate) : 'none',
                },
              ),
            ),
          ),
        ],
      },
    ],
    margin: [0, 0, 0, GAP],
  });

  content.push({
    columns: [
      party(
        doc.label(t({ id: 'documents.from', defaultMessage: 'From' })),
        note.sellerName,
        [
          note.sellerLine1,
          note.sellerLine2,
          note.sellerCity,
          note.sellerRegion,
          note.sellerPostalCode,
          note.sellerCountry,
        ],
        note.sellerTaxNumber
          ? [
              run(
                doc.label(
                  t(
                    {
                      id: 'documents.taxRegistration',
                      defaultMessage: 'Tax registration {number}',
                    },
                    { number: note.sellerTaxNumber },
                  ),
                ),
                { fontSize: 10.5 },
              ),
            ]
          : [],
      ),
      party(
        doc.label(t({ id: 'documents.to', defaultMessage: 'To' })),
        note.billToName,
        [
          note.billToLine1,
          note.billToLine2,
          note.billToCity,
          note.billToRegion,
          note.billToPostalCode,
          note.billToCountry,
        ],
      ),
    ],
    columnGap: 36,
    margin: [0, 0, 0, GAP],
  });

  // The reason as written: data, in whatever language it was typed.
  content.push(
    run(
      doc.label(
        t(
          { id: 'documents.reason', defaultMessage: 'Reason: {reason}' },
          { reason: note.reason },
        ),
      ),
      { fontSize: 10.5, margin: [0, 0, 0, GAP] },
    ),
    linesTable(
      doc,
      note.currency,
      note.lines.map((line) => ({
        sku: line.sku,
        description: line.description,
        secondDescription: line.secondDescription,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxCodeName: line.taxCodeName,
        amount: line.netAmount,
      })),
    ),
    totals(
      doc,
      note.currency,
      note.subtotal,
      note.taxes,
      note.total,
      t({ id: 'documents.totalCredited', defaultMessage: 'Total credited' }),
    ),
  );

  return { info: { title: note.number }, content };
}

/** The file's name: the credit note's number. */
export function creditNoteFileName(note: CreditNoteDetail): string {
  return `${note.number}.pdf`;
}
