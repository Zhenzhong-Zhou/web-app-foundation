import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import type { Printable } from '../../core/documents/documents.service';
import {
  formatDay,
  formatQuantity,
  NO_VALUE,
} from '../../core/documents/format';
import {
  addressLines,
  banner,
  block,
  cell,
  head,
  linesOf,
  logo,
  masthead,
  run,
  sideBySide,
} from '../../core/documents/sheet';
import { t, type Translatable } from '../../i18n/translate';
import type { PackingSlip } from './dto/shipment-response.dto';

/** A unit of measure by name, in each language; any other as stored. */
const UNITS: Record<string, Translatable> = {
  each: t({ id: 'products.unit.each', defaultMessage: 'each' }),
  kg: t({ id: 'products.unit.kg', defaultMessage: 'kg' }),
  g: t({ id: 'products.unit.g', defaultMessage: 'g' }),
  litre: t({ id: 'products.unit.litre', defaultMessage: 'litre' }),
  ml: t({ id: 'products.unit.ml', defaultMessage: 'ml' }),
  case: t({ id: 'products.unit.case', defaultMessage: 'case' }),
  box: t({ id: 'products.unit.box', defaultMessage: 'box' }),
  pallet: t({ id: 'products.unit.pallet', defaultMessage: 'pallet' }),
};

/**
 * One shipment as a PDF (ADR-071), as its packing slip page had it
 * (ADR-041). The lot and expiry columns are why it exists beyond a
 * courtesy: a customer checking a delivery, or a recall a year later,
 * reads them here.
 *
 * Its times are read in UTC: the print page read them in the browser's
 * time zone, which a server does not have, and an organization's own is
 * not kept yet (#41).
 */
export function packingSlipDocument(
  slip: PackingSlip,
  doc: DocumentText,
  logoDataUrl: string | null,
): TDocumentDefinitions {
  const day = (value: string | Date) => formatDay(value, doc.locale);
  const small = (text: string) => run(text, { fontSize: 10.5 });
  const title = doc.label(
    t({ id: 'documents.packingSlip', defaultMessage: 'Packing slip' }),
  );

  const content: Content[] = [];
  if (logoDataUrl) content.push(logo(logoDataUrl));

  // A voided slip found in a drawer later must not pass for goods that
  // left.
  if (slip.voidedAt) {
    content.push(
      banner(
        doc.label(
          t({
            id: 'documents.packingSlip.void',
            defaultMessage: 'VOID — nothing on this slip left',
          }),
        ),
        doc.lines(
          t(
            {
              id: 'documents.voidedOn',
              defaultMessage: 'Voided {date}: {reason}',
            },
            { date: day(slip.voidedAt), reason: slip.voidReason ?? '' },
          ),
        ),
      ),
    );
  }

  content.push(
    masthead(title, small(slip.organizationName), [
      doc.label(
        t(
          { id: 'documents.shippedOn', defaultMessage: 'Shipped {date}' },
          { date: day(slip.createdAt) },
        ),
      ),
      // Ours, which the slip is filed and asked about by, then theirs.
      doc.label(
        t(
          { id: 'documents.orderNumber', defaultMessage: 'Order {number}' },
          { number: slip.order.number },
        ),
      ),
      slip.order.reference &&
        doc.label(
          t(
            {
              id: 'documents.yourOrder',
              defaultMessage: 'Your order {reference}',
            },
            { reference: slip.order.reference },
          ),
        ),
    ]),
  );

  const address = slip.shipTo;
  content.push(
    sideBySide([
      block(
        doc.label(t({ id: 'documents.shipTo', defaultMessage: 'Ship to' })),
        [
          slip.order.partnerName,
          address?.label,
          ...addressLines([
            address?.line1,
            address?.line2,
            address?.city,
            address?.region,
            address?.postalCode,
            address?.country,
          ]),
        ],
      ),
      block(
        doc.label(t({ id: 'documents.shipment', defaultMessage: 'Shipment' })),
        [
          doc.label(
            t(
              { id: 'documents.fromLocation', defaultMessage: 'From {place}' },
              { place: slip.fromLocationName },
            ),
          ),
          slip.carrier &&
            doc.label(
              t(
                {
                  id: 'documents.carrier',
                  defaultMessage: 'Carrier: {carrier}',
                },
                { carrier: slip.carrier },
              ),
            ),
          slip.trackingNumber &&
            doc.label(
              t(
                {
                  id: 'documents.tracking',
                  defaultMessage: 'Tracking: {number}',
                },
                { number: slip.trackingNumber },
              ),
            ),
        ],
      ),
    ]),
  );

  // On paper a lot is a code to read: no link, as the page had none.
  const header: TableCell[] = [
    head(doc.label(t({ id: 'documents.sku', defaultMessage: 'SKU' }))),
    head(doc.label(t({ id: 'documents.item', defaultMessage: 'Item' }))),
    head(doc.label(t({ id: 'documents.lot', defaultMessage: 'Lot' }))),
    head(doc.label(t({ id: 'documents.expires', defaultMessage: 'Expires' }))),
    head(
      doc.label(t({ id: 'documents.quantity', defaultMessage: 'Quantity' })),
      'right',
    ),
  ];
  const rows: TableCell[][] = slip.items.map((item) => {
    const unit = UNITS[item.unitOfMeasure];
    // The figure once, the unit in each language.
    const quantity = [
      formatQuantity(item.quantity, doc.locale),
      unit ? doc.label(unit) : item.unitOfMeasure,
    ].join(' ');
    return [
      cell(item.sku),
      cell(item.description),
      cell(item.lotCode ?? NO_VALUE),
      cell(item.expiresAt ? day(item.expiresAt) : NO_VALUE),
      cell(quantity, 'right'),
    ];
  });

  content.push(linesOf(['auto', '*', 'auto', 'auto', 'auto'], header, rows));

  if (slip.note) content.push(small(slip.note));

  // For the person unpacking: a paper slip is often signed and kept. Not
  // on a voided one: nothing arrived to sign for.
  if (!slip.voidedAt) {
    content.push(
      run(
        doc.label(
          t(
            {
              id: 'documents.receivedBy',
              defaultMessage: 'Received by: {line} Date: {shortLine}',
            },
            { line: '______________________', shortLine: '____________' },
          ),
        ),
        { fontSize: 10.5, margin: [0, 24, 0, 0] },
      ),
    );
  }

  return { info: { title }, content };
}

/**
 * The slip for its PDF route, named by the day it shipped and the start
 * of its id. It has no seller copied: it formats in the organization's
 * country as it is now.
 */
export function printablePackingSlip(slip: PackingSlip): Printable {
  const shipped = new Date(slip.createdAt).toISOString().slice(0, 10);
  return {
    language: slip.language,
    secondLanguage: slip.secondLanguage,
    sellerCountry: null,
    name: `packing-slip-${shipped}-${slip.id.slice(0, 8)}.pdf`,
    draw: (doc, logo) => packingSlipDocument(slip, doc, logo),
  };
}
