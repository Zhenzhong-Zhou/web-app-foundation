import type { Content, TableCell } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type {
  Drawing,
  Printable,
} from '../../core/documents/documents.service';
import { formatDay, formatMoney } from '../../core/documents/format';
import { addressParts } from '../../core/documents/parties';
import {
  addressLines,
  banner,
  block,
  cell,
  GAP,
  head,
  itemNames,
  kindAndNumber,
  linesOf,
  masthead,
  notice,
  paragraph,
  party,
  quantityWithUnit,
  raisedByLine,
  run,
  sellerParty,
  sideBySide,
} from '../../core/documents/sheet';
import { t } from '../../i18n/translate';
import type { PurchaseOrderPrint } from './purchase-order-print.service';

const TITLE = t({
  id: 'documents.purchaseOrder',
  defaultMessage: 'Purchase order',
});

/**
 * A purchase order as a PDF (ADR-071), as approved on the canvas: what we
 * ask the supplier for, where to deliver it and by when. No tax column: a
 * supplier's invoice charges the tax. A line with no price yet prints
 * blank, with a line asking for it, and the total counts priced lines.
 */
export function purchaseOrderDocument(
  po: PurchaseOrderPrint,
  doc: DocumentText,
): Drawing {
  const day = (value: string | Date) => formatDay(value, doc.locale);
  const content: Content[] = [];

  // A cancelled order printed again must not be supplied against.
  if (po.status === 'cancelled') {
    content.push(
      banner(
        doc.label(
          t({
            id: 'documents.purchaseOrder.cancelled',
            defaultMessage: 'CANCELLED — supply nothing on this order',
          }),
        ),
        [],
      ),
    );
  }

  content.push(
    masthead(doc.label(TITLE), run(po.number, { fontSize: 15, bold: true }), [
      doc.label(
        t(
          { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
          { date: day(po.createdAt) },
        ),
      ),
      po.expectedAt &&
        doc.label(
          t(
            { id: 'documents.deliverBy', defaultMessage: 'Deliver by {date}' },
            { date: day(po.expectedAt) },
          ),
        ),
      po.reference &&
        doc.label(
          t(
            {
              id: 'documents.yourReference',
              defaultMessage: 'Your reference {reference}',
            },
            { reference: po.reference },
          ),
        ),
    ]),
  );

  const { seller, deliverTo } = po;
  content.push(
    sideBySide([
      sellerParty(
        doc,
        seller.name,
        addressParts(seller.address),
        seller.taxNumber,
      ),
      party(
        doc.label(t({ id: 'documents.to', defaultMessage: 'To' })),
        po.supplierName,
        addressParts(po.supplierAddress),
      ),
      // The site, at its address; the registered one while it has none.
      block(
        doc.label(
          t({ id: 'documents.deliverTo', defaultMessage: 'Deliver to' }),
        ),
        [
          seller.name,
          deliverTo?.name,
          ...addressLines(addressParts(deliverTo?.address ?? seller.address)),
        ],
      ),
    ]),
  );

  const money = (amount: string | null, currency: string | null) =>
    amount === null || currency === null
      ? ''
      : formatMoney(amount, currency, doc.locale);
  const header: TableCell[] = [
    head(doc.label(t({ id: 'documents.sku', defaultMessage: 'SKU' }))),
    head(doc.label(t({ id: 'documents.item', defaultMessage: 'Item' }))),
    head(
      doc.label(t({ id: 'documents.quantity', defaultMessage: 'Quantity' })),
      'right',
    ),
    head(
      doc.label(t({ id: 'documents.unitPrice', defaultMessage: 'Unit price' })),
      'right',
    ),
    head(
      doc.label(t({ id: 'documents.amount', defaultMessage: 'Amount' })),
      'right',
    ),
  ];
  const rows: TableCell[][] = po.lines.map((line) => [
    cell(line.sku),
    itemNames(line),
    cell(quantityWithUnit(doc, line.quantity, line.unitOfMeasure), 'right'),
    cell(money(line.unitPrice, line.currency), 'right'),
    cell(money(line.amount, line.currency), 'right'),
  ]);
  content.push(linesOf(['auto', '*', 'auto', 'auto', 'auto'], header, rows));

  const unpriced = po.lines.filter((line) => line.unitPrice === null).length;
  if (unpriced > 0) {
    content.push(
      paragraph(
        doc.label(
          t(
            {
              id: 'documents.purchaseOrder.unpriced',
              defaultMessage:
                '{count, plural, one {# line has} other {# lines have}} no price yet: please give {count, plural, one {it} other {them}} when you confirm.',
            },
            { count: unpriced },
          ),
        ),
      ),
    );
  }

  if (po.totals.length > 0) {
    const body: TableCell[][] = po.totals.map((total) => [
      run(
        doc.label(
          t(
            {
              id: 'documents.purchaseOrder.total',
              defaultMessage: 'Total of priced lines ({currency})',
            },
            { currency: total.currency },
          ),
        ),
        { fontSize: 10.5, bold: true },
      ),
      run(formatMoney(total.amount, total.currency, doc.locale), {
        fontSize: 10.5,
        bold: true,
        alignment: 'right',
        noWrap: true,
      }),
    ]);
    content.push({
      columns: [
        { width: '*', text: '' },
        {
          width: 'auto',
          stack: [
            {
              table: { widths: ['auto', 'auto'], body },
              layout: {
                hLineWidth: () => 0,
                vLineWidth: () => 0,
                paddingLeft: (column: number) => (column === 0 ? 0 : 24),
                paddingRight: () => 0,
                paddingTop: () => 2,
                paddingBottom: () => 2,
              },
            },
            run(
              doc.label(
                t({ id: 'documents.beforeTax', defaultMessage: 'Before tax' }),
              ),
              { fontSize: 9, alignment: 'right' },
            ),
          ],
        },
      ],
      margin: [0, 0, 0, GAP],
    });
  }

  if (po.note) {
    content.push(
      paragraph(
        doc.label(
          t(
            { id: 'documents.noteText', defaultMessage: 'Note: {note}' },
            { note: po.note },
          ),
        ),
      ),
    );
  }

  // What lets their paperwork find ours.
  content.push(
    notice(
      doc.lines(
        t(
          {
            id: 'documents.purchaseOrder.quote',
            defaultMessage:
              'Please quote {number} on your delivery note and your invoice.',
          },
          { number: po.number },
        ),
      ),
      true,
    ),
    ...raisedByLine(doc, po.raisedBy),
  );

  return { info: { title: po.number }, content };
}

/** The purchase order for its PDF route, named by its number. */
export function printablePurchaseOrder(po: PurchaseOrderPrint): Printable {
  return {
    language: po.language,
    secondLanguage: po.secondLanguage,
    sellerCountry: null,
    name: `${po.number}.pdf`,
    which: (doc) => kindAndNumber(doc.label(TITLE), po.number),
    draw: (doc) => purchaseOrderDocument(po, doc),
  };
}
