import { buffer } from 'node:stream/consumers';

import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { t } from '../i18n/translate';
import { csvFile, type ExportColumn } from './export';

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
