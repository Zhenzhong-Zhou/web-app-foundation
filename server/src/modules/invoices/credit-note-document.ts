import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type { Printable } from '../../core/documents/documents.service';
import { formatDay } from '../../core/documents/format';
import {
  GAP,
  linesTable,
  logo,
  masthead,
  party,
  run,
  sideBySide,
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

  const content: Content[] = [];
  if (logoDataUrl) content.push(logo(logoDataUrl));

  content.push(
    masthead(
      doc.label(
        t({ id: 'documents.creditNote', defaultMessage: 'Credit note' }),
      ),
      run(note.number, { fontSize: 15, bold: true }),
      [
        doc.label(
          t(
            { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
            { date: day(note.creditDate) },
          ),
        ),
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
      ],
    ),
  );

  content.push(
    sideBySide([
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
    ]),
  );

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
    linesTable(doc, note.currency, note.lines),
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

/** The credit note for its PDF route, named by its number. */
export function printableCreditNote(note: CreditNoteDetail): Printable {
  return {
    language: note.language,
    secondLanguage: note.secondLanguage,
    // Copied at issue, as the invoice's was.
    sellerCountry: note.sellerCountry,
    name: `${note.number}.pdf`,
    draw: (doc, logo) => creditNoteDocument(note, doc, logo),
  };
}
