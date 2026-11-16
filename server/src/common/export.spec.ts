import type { Response } from 'express';

import { t } from '../i18n/translate';
import { BOM } from './csv';
import { csvFile, type ExportColumn, inWords } from './export';
import { PRODUCT_TYPE_WORDS } from './product-types';

type Row = { sku: string; type: string | null };

const COLUMNS: ExportColumn<Row>[] = [
  {
    header: t({ id: 'exports.column.sku', defaultMessage: 'Code' }),
    value: (row) => row.sku,
  },
  inWords(
    t({ id: 'exports.column.type', defaultMessage: 'Type' }),
    PRODUCT_TYPE_WORDS,
    (row) => row.type,
  ),
];

/** The file csvFile writes, its headers sent to nowhere. */
function file(rows: Row[], locale: 'en' | 'fr-CA' | 'zh-Hans'): string[] {
  const res = { setHeader: () => undefined } as unknown as Response;
  return csvFile(res, 'items', COLUMNS, rows, locale)
    .replace(BOM, '')
    .split('\r\n')
    .filter(Boolean);
}

/**
 * An export writes a code the app keeps as the screen's word for it, in
 * the reader's language (#473's 29), and a code with no word as it is
 * stored, never a blank.
 */
describe('inWords', () => {
  it("writes each code as the screen's word, in the reader's language", () => {
    const rows = [
      { sku: 'VITC-90', type: 'good' },
      { sku: 'GEL-1', type: 'material' },
    ];

    expect(file(rows, 'en')).toEqual([
      'Code,Type',
      'VITC-90,Products',
      'GEL-1,Raw materials',
    ]);
    expect(file(rows, 'fr-CA')).toEqual([
      'Code,Type',
      'VITC-90,Produits',
      'GEL-1,Matières premières',
    ]);
    expect(file(rows, 'zh-Hans')).toEqual([
      '编码,类型',
      'VITC-90,商品',
      'GEL-1,原材料',
    ]);
  });

  it('writes a code with no word as stored, and none as an empty field', () => {
    const rows = [
      { sku: 'OLD-1', type: 'kit' },
      { sku: 'PROTO-1', type: 'constructor' },
      { sku: 'NONE-1', type: null },
    ];

    expect(file(rows, 'zh-Hans').slice(1)).toEqual([
      'OLD-1,kit',
      'PROTO-1,constructor',
      'NONE-1,',
    ]);
  });
});
