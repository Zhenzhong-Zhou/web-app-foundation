import type {
  Content,
  ContentText,
  Style,
  TableCell,
} from 'pdfmake/interfaces';

import type { Locale } from '../../common/locales';
import { t, type Translatable, translate } from '../../i18n/translate';
import type { DocumentText } from './document-text';
import { formatMoney, formatQuantity, NO_VALUE } from './format';
import { fontFor } from './pdf-renderer.service';

/**
 * The parts every document shares, as the print pages drew them (ADR-055),
 * now for pdfmake (ADR-071): the logo, a warning banner, a party, the lines
 * and the totals. The invoice and the credit note use the same lines and
 * totals, so a credit reads as the invoice it reverses.
 *
 * Sizes are the print pages' in points, a CSS pixel being 0.75 of one:
 * a title 18, a document number 15, a party 12, the lines and totals 10.5,
 * a heading above a party 9.
 */

/** The red of a warning that must survive the printer, as a border. */
export const WARNING = '#d32f2f';
/** The rule under each line of a table. */
const RULE = '#e0e0e0';
/** Space between a sheet's parts: the print pages' 24 px. */
export const GAP = 18;

const millimetres = (mm: number) => (mm / 25.4) * 72;

/** A run of text, in the family that has its characters. */
export function run(text: string, style: Style = {}): ContentText {
  return { text, font: fontFor(text), ...style };
}

/** The organization's logo, at most 60 mm wide and 18 mm tall (ADR-060). */
export function logo(dataUrl: string): Content {
  return {
    image: dataUrl,
    fit: [millimetres(60), millimetres(18)],
    margin: [0, 0, 0, GAP],
  };
}

/** A warning across the top of a sheet; each detail line one language's. */
export function banner(title: string, detail: string[] = []): Content {
  const ruled = () => 2;
  const red = () => WARNING;
  const padded = () => 12;
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              run(title, { fontSize: 15, color: WARNING }),
              ...detail.map((line) =>
                run(line, { fontSize: 10.5, margin: [0, 2, 0, 0] }),
              ),
            ],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: ruled,
      vLineWidth: ruled,
      hLineColor: red,
      vLineColor: red,
      paddingLeft: padded,
      paddingRight: padded,
      paddingTop: padded,
      paddingBottom: padded,
    },
    margin: [0, 0, 0, GAP],
  };
}

/** A name and an address, one line per part, as a letter is addressed. */
export function party(
  heading: string,
  name: string | null,
  lines: (string | null)[],
  extra: Content[] = [],
): Content {
  const [line1, line2, city, region, postalCode, country] = lines;
  const place = [city, region, postalCode].filter(Boolean).join(', ');
  const written = [name, line1, line2, place, country].filter(
    (line): line is string => Boolean(line),
  );
  return {
    stack: [
      run(heading.toUpperCase(), {
        fontSize: 9,
        characterSpacing: 0.75,
        margin: [0, 0, 0, 2],
      }),
      ...written.map((line) => run(line, { fontSize: 12 })),
      ...extra,
    ],
  };
}

/** One billed line, as an invoice or a credit note prints it. */
export interface SheetLine {
  sku: string;
  description: string;
  /** The name in the second language, copied at issue; null for one. */
  secondDescription: string | null;
  quantity: string;
  unitPrice: string;
  taxCodeName: string | null;
  /** Before tax; null prints a dash. */
  amount: string | null;
}

/** A table's rules: one under the header and under each line. */
const LINES_LAYOUT = {
  hLineWidth: (index: number) => (index === 0 ? 0 : 0.75),
  vLineWidth: () => 0,
  hLineColor: () => RULE,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

/**
 * The lines of an invoice or a credit note: the same columns in the same
 * order on both. Each language's name on its own line, the same weight:
 * the second is not a footnote to the first.
 */
export function linesTable(
  doc: DocumentText,
  currency: string,
  lines: SheetLine[],
): Content {
  const head = (text: string, alignment: 'left' | 'right' = 'left') =>
    run(text, { fontSize: 10.5, bold: true, alignment });
  const cell = (text: string, alignment: 'left' | 'right' = 'left') =>
    run(text, { fontSize: 10.5, alignment, noWrap: alignment === 'right' });
  const money = (amount: string | null) =>
    formatMoney(amount, currency, doc.locale);

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
    head(doc.label(t({ id: 'documents.tax', defaultMessage: 'Tax' }))),
    head(
      doc.label(t({ id: 'documents.amount', defaultMessage: 'Amount' })),
      'right',
    ),
  ];

  const rows: TableCell[][] = lines.map((line) => [
    cell(line.sku),
    {
      stack: [
        run(line.description, { fontSize: 10.5 }),
        ...(line.secondDescription &&
        line.secondDescription !== line.description
          ? [run(line.secondDescription, { fontSize: 10.5 })]
          : []),
      ],
    },
    cell(formatQuantity(line.quantity, doc.locale), 'right'),
    cell(money(line.unitPrice), 'right'),
    cell(line.taxCodeName ?? NO_VALUE),
    cell(money(line.amount), 'right'),
  ]);

  return {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
      body: [header, ...rows],
    },
    layout: LINES_LAYOUT,
    margin: [0, 0, 0, GAP],
  };
}

/** A tax as a document totals it. */
export interface SheetTax {
  name: string;
  rate: string;
  taxableAmount: string;
  amount: string;
}

/** "9.975%" in English, "9,975 %" in French: a rate in one language. */
function rateIn(rate: string, language: Locale, tag: string): string {
  return translate(
    t(
      { id: 'documents.rate', defaultMessage: '{value}%' },
      { value: formatQuantity(rate, tag) },
    ),
    language,
  );
}

/**
 * Subtotal, one line per tax, and the total, right-aligned under the
 * lines. The currency code is spelled out beside the total, because "$"
 * alone is five currencies.
 */
export function totals(
  doc: DocumentText,
  currency: string,
  subtotal: string | null,
  taxes: SheetTax[],
  total: string | null,
  /** "Total" or "Total credited". */
  totalLabel: Translatable,
): Content {
  const money = (amount: string | null) =>
    formatMoney(amount, currency, doc.locale);
  const row = (label: string, amount: string, bold = false): TableCell[] => [
    run(label, { fontSize: 10.5, bold }),
    run(amount, { fontSize: 10.5, bold, alignment: 'right', noWrap: true }),
  ];

  const body: TableCell[][] = [
    row(
      doc.label(t({ id: 'documents.subtotal', defaultMessage: 'Subtotal' })),
      money(subtotal),
    ),
    ...taxes.map((tax) =>
      row(
        doc.label((language, tag) =>
          t(
            {
              id: 'documents.taxOn',
              defaultMessage: '{tax} {rate} on {amount}',
            },
            {
              tax: tax.name,
              rate: rateIn(tax.rate, language, tag),
              amount: money(tax.taxableAmount),
            },
          ),
        ),
        money(tax.amount),
      ),
    ),
    row(
      doc.label((language) =>
        t(
          { id: 'documents.totalIn', defaultMessage: '{total} ({currency})' },
          { total: translate(totalLabel, language), currency },
        ),
      ),
      money(total),
      true,
    ),
  ];

  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
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
    ],
    margin: [0, 0, 0, GAP],
  };
}
