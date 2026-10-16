import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type { Printable } from '../../core/documents/documents.service';
import { formatDay } from '../../core/documents/format';
import { addressParts } from '../../core/documents/parties';
import {
  kindAndNumber,
  linesTable,
  logo,
  masthead,
  notice,
  party,
  run,
  sideBySide,
  totals,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
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
  logoDataUrl: string | null,
): TDocumentDefinitions {
  const title = doc.label(TITLE);
  const content: Content[] = [];
  if (logoDataUrl) content.push(logo(logoDataUrl));

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
            { date: formatDay(proForma.madeAt, doc.locale) },
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
    party(
      doc.label(t({ id: 'documents.from', defaultMessage: 'From' })),
      seller.name,
      addressParts(seller.address),
      seller.taxNumber
        ? [
            run(
              doc.label(
                t(
                  {
                    id: 'documents.taxRegistration',
                    defaultMessage: 'Tax registration {number}',
                  },
                  { number: seller.taxNumber },
                ),
              ),
              { fontSize: 10.5 },
            ),
          ]
        : [],
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
    name: `${proForma.orderNumber}-pro-forma.pdf`,
    which: (doc) => kindAndNumber(doc.label(TITLE), proForma.orderNumber),
    draw: (doc, logo) => proFormaDocument(proForma, doc, logo),
  };
}
