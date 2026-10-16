import type { Content, TableCell } from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type {
  Drawing,
  Printable,
} from '../../core/documents/documents.service';
import { formatDay, formatQuantity } from '../../core/documents/format';
import { addressParts } from '../../core/documents/parties';
import {
  addressLines,
  banner,
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
  present,
  raisedByLine,
  run,
  sideBySide,
} from '../../core/documents/sheet';
import type { ReturnResolution } from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import type { ReturnAuthorizationPrint } from './return-authorization-print.service';

const TITLE = t({
  id: 'documents.returnAuthorization',
  defaultMessage: 'Return authorization',
});

/** What happens to each item, as the key at the foot of the lines says. */
const RESOLUTIONS: Record<ReturnResolution, Translatable> = {
  credit: t({ id: 'documents.resolution.credit', defaultMessage: 'Credit' }),
  replace: t({ id: 'documents.resolution.replace', defaultMessage: 'Replace' }),
  none: t({ id: 'documents.resolution.none', defaultMessage: 'No credit' }),
};

/**
 * A return authorization as a PDF (ADR-071), as approved on the canvas:
 * the number to write on every box, what may come back and what happens to
 * each item, and, when goods are expected, a label to cut out and tape to
 * the box, so it arrives at the right building with the number on it.
 */
export function returnAuthorizationDocument(
  rma: ReturnAuthorizationPrint,
  doc: DocumentText,
): Drawing {
  const content: Content[] = [];

  if (rma.status === 'cancelled') {
    content.push(
      banner(
        doc.label(
          t({
            id: 'documents.returnAuthorization.cancelled',
            defaultMessage:
              'CANCELLED — send nothing back on this authorization',
          }),
        ),
        [],
      ),
    );
  }

  content.push(
    masthead(doc.label(TITLE), run(rma.number, { fontSize: 15, bold: true }), [
      doc.label(
        t(
          { id: 'documents.dateOn', defaultMessage: 'Date {date}' },
          { date: formatDay(rma.createdAt, doc.locale) },
        ),
      ),
      doc.label(
        t(
          { id: 'documents.orderNumber', defaultMessage: 'Order {number}' },
          { number: rma.orderNumber },
        ),
      ),
      rma.invoiceNumber &&
        doc.label(
          t(
            {
              id: 'documents.invoiceNumber',
              defaultMessage: 'Invoice {number}',
            },
            { number: rma.invoiceNumber },
          ),
        ),
    ]),
  );

  const { seller } = rma;
  content.push(
    sideBySide([
      party(
        doc.label(t({ id: 'documents.from', defaultMessage: 'From' })),
        seller.name,
        addressParts(seller.address),
      ),
      party(
        doc.label(t({ id: 'documents.customer', defaultMessage: 'Customer' })),
        rma.customerName,
        addressParts(rma.customerAddress),
      ),
    ]),
  );

  // The box: the one thing the customer must do, or that they need do
  // nothing. Sending to the label is said only while the label is drawn,
  // on an RMA still open; a closed or cancelled one expects nothing more.
  if (rma.expectsGoods && rma.status === 'open') {
    content.push(
      notice(
        [
          ...doc.lines(
            t(
              {
                id: 'documents.returnAuthorization.writeNumber',
                defaultMessage: 'Write {number} on the outside of every box.',
              },
              { number: rma.number },
            ),
          ),
          ...doc.lines(
            t({
              id: 'documents.returnAuthorization.sendTo',
              defaultMessage:
                'Send the goods to the address on the label below; a box without the number may be refused.',
            }),
          ),
        ],
        true,
      ),
    );
  } else if (!rma.expectsGoods) {
    content.push(
      notice(
        [
          ...doc.lines(
            t({
              id: 'documents.returnAuthorization.nothingBack',
              defaultMessage: 'Nothing needs to be sent back.',
            }),
          ),
          ...doc.lines(
            t({
              id: 'documents.returnAuthorization.keep',
              defaultMessage:
                'Please dispose of the goods below. Keep this authorization: it is the record of what was agreed.',
            }),
          ),
        ],
        true,
      ),
    );
  }
  content.push(
    paragraph(
      doc.label(
        t(
          { id: 'documents.reason', defaultMessage: 'Reason: {reason}' },
          { reason: rma.reason },
        ),
      ),
    ),
  );

  const header: TableCell[] = [
    head(doc.label(t({ id: 'documents.sku', defaultMessage: 'SKU' }))),
    head(doc.label(t({ id: 'documents.item', defaultMessage: 'Item' }))),
    head(
      doc.label(t({ id: 'documents.quantity', defaultMessage: 'Quantity' })),
      'right',
    ),
    head(
      doc.label(
        t({ id: 'documents.whatHappens', defaultMessage: 'What happens' }),
      ),
    ),
  ];
  const rows: TableCell[][] = rma.lines.map((line) => [
    cell(line.sku),
    itemNames(line),
    cell(formatQuantity(line.quantity, doc.locale), 'right'),
    cell(doc.label(RESOLUTIONS[line.resolution])),
  ]);
  content.push(
    linesOf(['auto', '*', 'auto', 'auto'], header, rows),
    ...doc
      .lines(
        t({
          id: 'documents.returnAuthorization.key',
          defaultMessage:
            'Credit: money back for what is returned. Replace: the same goods sent again, at no charge. No credit: back for inspection, nothing owed either way.',
        }),
      )
      .map((line) => run(line, { fontSize: 9, margin: [0, 0, 0, 4] })),
    { text: '', margin: [0, 0, 0, GAP] },
  );

  if (rma.note) {
    content.push(paragraph(rma.note));
  }
  content.push(...raisedByLine(doc, rma.raisedBy));

  // Only while something can still come back.
  if (rma.expectsGoods && rma.status === 'open') {
    content.push(cutOutLabel(rma, doc));
  }

  return { info: { title: rma.number }, content };
}

/**
 * The label to cut out and tape to the box: where it goes, large enough
 * to read across a loading dock, and the number to match it to. Dashed,
 * so it reads as something to cut along, and never split across pages.
 */
function cutOutLabel(
  rma: ReturnAuthorizationPrint,
  doc: DocumentText,
): Content {
  const dashed = () => ({ dash: { length: 4, space: 3 } });
  const site = rma.sendBackTo;
  const address = present(
    addressLines(addressParts(site?.address ?? rma.seller.address)),
  );

  return {
    unbreakable: true,
    stack: [
      run(
        doc.label(
          t({
            id: 'documents.returnAuthorization.cutOut',
            defaultMessage: 'Cut out and tape to the box',
          }),
        ),
        { fontSize: 9, margin: [0, GAP, 0, 4] },
      ),
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  run(
                    doc
                      .label(
                        t({
                          id: 'documents.returnTo',
                          defaultMessage: 'Return to',
                        }),
                      )
                      .toUpperCase(),
                    { fontSize: 9, characterSpacing: 0.75 },
                  ),
                  run(rma.seller.name, { fontSize: 14, bold: true }),
                  ...(site ? [run(site.name, { fontSize: 14 })] : []),
                  ...address.map((line) => run(line, { fontSize: 14 })),
                  run(rma.number, {
                    fontSize: 28,
                    bold: true,
                    margin: [0, 10, 0, 4],
                  }),
                  run(
                    doc.label(
                      t(
                        {
                          id: 'documents.fromCustomer',
                          defaultMessage: 'From {name}',
                        },
                        { name: rma.customerName },
                      ),
                    ),
                    { fontSize: 10.5 },
                  ),
                ],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineStyle: dashed,
          vLineStyle: dashed,
          paddingLeft: () => 14,
          paddingRight: () => 14,
          paddingTop: () => 14,
          paddingBottom: () => 14,
        },
      },
    ],
  };
}

/** The RMA for its PDF route, named by its number. */
export function printableReturnAuthorization(
  rma: ReturnAuthorizationPrint,
): Printable {
  return {
    language: rma.language,
    secondLanguage: rma.secondLanguage,
    sellerCountry: null,
    name: `${rma.number}.pdf`,
    which: (doc) => kindAndNumber(doc.label(TITLE), rma.number),
    draw: (doc) => returnAuthorizationDocument(rma, doc),
  };
}
