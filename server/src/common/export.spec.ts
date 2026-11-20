import { buffer } from 'node:stream/consumers';

import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { t } from '../i18n/translate';
import { BOM } from './csv';
import {
  asMoney,
  asQuantity,
  csvFile,
  type ExportColumn,
  inWords,
} from './export';
import { HEADERS } from './export-headers';
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
async function file(
  rows: Row[],
  locale: 'en' | 'fr-CA' | 'zh-Hans',
): Promise<string[]> {
  const res = { setHeader: () => undefined } as unknown as Response;
  const sent = csvFile(res, 'items', COLUMNS, rows, locale);
  return (await buffer(sent.getStream()))
    .toString('utf8')
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
  it("writes each code as the screen's word, in the reader's language", async () => {
    const rows = [
      { sku: 'VITC-90', type: 'good' },
      { sku: 'GEL-1', type: 'material' },
    ];

    expect(await file(rows, 'en')).toEqual([
      'Code,Type',
      'VITC-90,Products',
      'GEL-1,Raw materials',
    ]);
    expect(await file(rows, 'fr-CA')).toEqual([
      'Code,Type',
      'VITC-90,Produits',
      'GEL-1,Matières premières',
    ]);
    expect(await file(rows, 'zh-Hans')).toEqual([
      '编码,类型',
      'VITC-90,商品',
      'GEL-1,原材料',
    ]);
  });

  it('writes a code with no word as stored, and none as an empty field', async () => {
    const rows = [
      { sku: 'OLD-1', type: 'kit' },
      { sku: 'PROTO-1', type: 'constructor' },
      { sku: 'NONE-1', type: null },
    ];

    expect((await file(rows, 'zh-Hans')).slice(1)).toEqual([
      'OLD-1,kit',
      'PROTO-1,constructor',
      'NONE-1,',
    ]);
  });
});

/**
 * An export writes a quantity as data without its padding zeros (ADR-093's
 * R30, #473's 29): `600`, not `600.0000`, a minus kept as a number's; and
 * money beside it at its currency's places, never fewer, never rounded
 * (99a): `12.50`, `0.0123`, yen's `1250`; with no currency, as stored.
 */
describe('asQuantity and asMoney', () => {
  type Line = {
    quantity: string | null;
    price: string | null;
    currency: string | null;
  };

  const LINE_COLUMNS: ExportColumn<Line>[] = [
    asQuantity(HEADERS.quantity, (row) => row.quantity),
    asMoney(
      HEADERS.price,
      (row) => row.price,
      (row) => row.currency,
    ),
  ];

  it('drops the padding zeros of a quantity, and money’s down to its currency’s places', async () => {
    const res = { setHeader: () => undefined } as unknown as Response;
    const sent = csvFile(
      res,
      'lines',
      LINE_COLUMNS,
      [
        { quantity: '600.0000', price: '12.5000', currency: 'CAD' },
        { quantity: '12.5000', price: '1250.0000', currency: 'JPY' },
        { quantity: '0.0001', price: '0.0123', currency: 'CAD' },
        { quantity: '-5.0000', price: '-3.0000', currency: 'CAD' },
        { quantity: '1234567.0000', price: '1234567.0000', currency: 'CAD' },
        { quantity: null, price: '0.0000', currency: 'CAD' },
        { quantity: '1.0000', price: '2.500000', currency: null },
        { quantity: '1.0000', price: null, currency: 'CAD' },
      ],
      'fr-CA',
    );

    expect(
      (await buffer(sent.getStream()))
        .toString('utf8')
        .replace(BOM, '')
        .split('\r\n')
        .filter(Boolean),
    ).toEqual([
      'Quantité,Prix',
      '600,12.50',
      '12.5,1250',
      '0.0001,0.0123',
      '-5,-3.00',
      // No grouping, and a point in every language.
      '1234567,1234567.00',
      ',0.00',
      '1,2.500000',
      '1,',
    ]);
  });
});

describe('csvFile', () => {
  function response() {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as Response;
    return { res, headers };
  }

  const columns: ExportColumn<{ name: string }>[] = [
    {
      header: t({ id: 'exports.column.name', defaultMessage: 'Name' }),
      value: (row) => row.name,
    },
  ];

  // Node 26 can abort while Express measures a large string it sends
  // (#602): the file leaves as bytes encoded here, never as text.
  it('returns the CSV as encoded bytes, with its length, not as text', async () => {
    const { res, headers } = response();

    const file = csvFile(res, 'items', columns, [{ name: '深海鱼油' }], 'en');

    expect(file).toBeInstanceOf(StreamableFile);
    const expected = '﻿Name\r\n深海鱼油\r\n';
    expect(file.getHeaders().length).toBe(
      new TextEncoder().encode(expected).length,
    );
    expect(await buffer(file.getStream())).toEqual(Buffer.from(expected));
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toMatch(
      /^attachment; filename="items-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
  });
});
