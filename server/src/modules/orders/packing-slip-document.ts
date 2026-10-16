import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

import type { DocumentText } from '../../core/documents/document-text';
import {
  formatDay,
  formatQuantity,
  NO_VALUE,
} from '../../core/documents/format';
import { banner, GAP, logo, run } from '../../core/documents/sheet';
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

/** The rules of the items table, as the invoice's lines have them. */
const ITEMS_LAYOUT = {
  hLineWidth: (index: number) => (index === 0 ? 0 : 0.75),
  vLineWidth: () => 0,
  hLineColor: () => '#e0e0e0',
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
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
  const heading = (text: string) =>
    run(text.toUpperCase(), {
      fontSize: 9,
      characterSpacing: 0.75,
      margin: [0, 0, 0, 2],
    });
  const line = (text: string) => run(text, { fontSize: 12 });
  const small = (text: string) => run(text, { fontSize: 10.5 });
  const smallRight = (text: string) =>
    run(text, { fontSize: 10.5, alignment: 'right' });
  const voided = slip.voidedAt !== null;

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

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          run(
            doc.label(
              t({
                id: 'documents.packingSlip',
                defaultMessage: 'Packing slip',
              }),
            ),
            { fontSize: 18 },
          ),
          small(slip.organizationName),
        ],
      },
      {
        width: 'auto',
        stack: [
          smallRight(
            doc.label(
              t(
                { id: 'documents.shippedOn', defaultMessage: 'Shipped {date}' },
                { date: day(slip.createdAt) },
              ),
            ),
          ),
          ...(slip.order.reference
            ? [
                smallRight(
                  doc.label(
                    t(
                      {
                        id: 'documents.orderReference',
                        defaultMessage: 'Order {reference}',
                      },
                      { reference: slip.order.reference },
                    ),
                  ),
                ),
              ]
            : []),
        ],
      },
    ],
    margin: [0, 0, 0, GAP],
  });

  const address = slip.shipTo;
  const place = address
    ? [address.city, address.region, address.postalCode]
        .filter(Boolean)
        .join(', ')
    : '';
  const shipTo = [
    slip.order.partnerName,
    address?.label,
    address?.line1,
    address?.line2,
    place,
    address?.country,
  ].filter((text): text is string => Boolean(text));

  const shipment = [
    doc.label(
      t(
        { id: 'documents.fromLocation', defaultMessage: 'From {place}' },
        { place: slip.fromLocationName },
      ),
    ),
    slip.carrier &&
      doc.label(
        t(
          { id: 'documents.carrier', defaultMessage: 'Carrier: {carrier}' },
          { carrier: slip.carrier },
        ),
      ),
    slip.trackingNumber &&
      doc.label(
        t(
          { id: 'documents.tracking', defaultMessage: 'Tracking: {number}' },
          { number: slip.trackingNumber },
        ),
      ),
  ].filter((text): text is string => Boolean(text));

  content.push({
    columns: [
      {
        stack: [
          heading(
            doc.label(t({ id: 'documents.shipTo', defaultMessage: 'Ship to' })),
          ),
          ...shipTo.map(line),
        ],
      },
      {
        stack: [
          heading(
            doc.label(
              t({ id: 'documents.shipment', defaultMessage: 'Shipment' }),
            ),
          ),
          ...shipment.map(line),
        ],
      },
    ],
    columnGap: 36,
    margin: [0, 0, 0, GAP],
  });

  // On paper a lot is a code to read: no link, as the page had none.
  const head = (text: string, alignment: 'left' | 'right' = 'left') =>
    run(text, { fontSize: 10.5, bold: true, alignment });
  const cell = (text: string, alignment: 'left' | 'right' = 'left') =>
    run(text, { fontSize: 10.5, alignment, noWrap: alignment === 'right' });

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

  content.push({
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto'],
      body: [header, ...rows],
    },
    layout: ITEMS_LAYOUT,
    margin: [0, 0, 0, GAP],
  });

  if (slip.note) content.push(small(slip.note));

  // For the person unpacking: a paper slip is often signed and kept. Not
  // on a voided one: nothing arrived to sign for.
  if (!voided) {
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

  return {
    info: {
      title: doc.label(
        t({ id: 'documents.packingSlip', defaultMessage: 'Packing slip' }),
      ),
    },
    content,
  };
}

/** The file's name: the day it shipped and the start of its id. */
export function packingSlipFileName(slip: PackingSlip): string {
  const shipped = new Date(slip.createdAt).toISOString().slice(0, 10);
  return `packing-slip-${shipped}-${slip.id.slice(0, 8)}.pdf`;
}
