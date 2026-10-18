import type { Content } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type {
  Drawing,
  Printable,
} from '../../core/documents/documents.service';
import { addressParts } from '../../core/documents/parties';
import {
  kindAndNumber,
  linesTable,
  masthead,
  notice,
  party,
  run,
  sellerParty,
  sideBySide,
  totals,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
import { fileNameOf } from '../numbering/numbering-format';
import type { ProForma } from './pro-forma.service';

const TITLE = t({
  id: 'documents.proForma',
  defaultMessage: 'Pro forma invoice',
});

/**
 * The pro forma invoice as a PDF (ADR-071), as approved on the canvas: an
 * invoice's layout, its lines and totals the invoice's own, titled so it
 * cannot pass for one. "Not a tax invoice" stands where a number would,
 * its order and the day it was made beside, and a boxed note at the end
 * says nothing is owed.
 */
export function proFormaDocument(
  proForma: ProForma,
  doc: DocumentText,
): Drawing {
  const title = doc.label(TITLE);
  const content: Content[] = [];

  content.push(
    masthead(
      title,
      run(
        doc.label(
          t({
            id: 'documents.notTaxInvoice',
            defaultMessage: 'Not a tax invoice',
          }),
        ),
        { fontSize: 12, bold: true },
      ),
      [
        doc.label(
          t(
            { id: 'documents.orderNumber', defaultMessage: 'Order {number}' },
            { number: proForma.orderNumber },
          ),
        ),
        doc.label(
          t(
            { id: 'documents.madeOn', defaultMessage: 'Made {date}' },
            // When it was made, in the organization's zone (ADR-072).
            { date: doc.dayOf(proForma.madeAt) },
          ),
        ),
        proForma.orderReference &&
          doc.label(
            t(
              {
                id: 'documents.yourOrder',
                defaultMessage: 'Your order {reference}',
              },
              { reference: proForma.orderReference },
            ),
          ),
      ],
    ),
  );

  const { seller } = proForma;
  const parties: Content[] = [
    sellerParty(
      doc,
      seller.name,
      addressParts(seller.address),
      seller.taxNumber,
    ),
    party(
      doc.label(t({ id: 'documents.billTo', defaultMessage: 'Bill to' })),
      proForma.customerName,
      addressParts(proForma.billTo),
    ),
  ];
  if (proForma.shipTo) {
    parties.push(
      party(
        doc.label(t({ id: 'documents.shipTo', defaultMessage: 'Ship to' })),
        proForma.shipTo.label ?? proForma.customerName,
        addressParts(proForma.shipTo),
      ),
    );
  }
  content.push(sideBySide(parties));

  content.push(
    linesTable(doc, proForma.currency, proForma.lines),
    totals(
      doc,
      proForma.currency,
      proForma.amounts.subtotal,
      proForma.amounts.taxes,
      proForma.amounts.total,
      t({ id: 'documents.total', defaultMessage: 'Total' }),
    ),
    notice(
      doc.lines(
        t({
          id: 'documents.proForma.notice',
          defaultMessage:
            'This is not a tax invoice, and nothing is owed on it. It shows the order as it stands on the day it was made; the invoice comes when the goods ship.',
        }),
      ),
    ),
  );

  return { info: { title: `${title} ${proForma.orderNumber}` }, content };
}

/** The pro forma for its PDF route, named by its order. */
export function printableProForma(proForma: ProForma): Printable {
  return {
    language: proForma.language,
    secondLanguage: proForma.secondLanguage,
    // Nothing is copied: it formats in the organization's country as now.
    sellerCountry: null,
    name: () => `${fileNameOf(proForma.orderNumber)}-pro-forma.pdf`,
    which: (doc) => kindAndNumber(doc.label(TITLE), proForma.orderNumber),
    draw: (doc) => proFormaDocument(proForma, doc),
  };
}
