import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

import { t, type Translatable, translate } from '../i18n/translate';
import { type CsvValue, toCsv } from './csv';
import type { KeysetPage } from './keyset';
import type { Locale } from './locales';

/**
 * Exports (ADR-057): every row a list's filters match, as CSV, through the
 * list's own query, so the export and the list can never disagree.
 */

/** Past this, an export is refused: a request holds a connection until done. */
export const EXPORT_LIMIT = 50_000;

/** Rows read per query while collecting an export. */
const BATCH = 1_000;

/** One column of an export: its header, and its value for a row. */
export interface ExportColumn<T> {
  header: Translatable;
  value: (row: T) => CsvValue;
}

/**
 * Every row of a list, page after page through its own service method,
 * with the list's filters, search, range and sort. Refused past
 * EXPORT_LIMIT with a message to narrow it.
 */
export async function everyRow<T extends { id: string }>(
  page: (before: string | undefined, limit: number) => Promise<KeysetPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let before: string | undefined;

  for (;;) {
    const { entries, nextCursor } = await page(before, BATCH);
    rows.push(...entries);

    if (rows.length > EXPORT_LIMIT) {
      throw new BadRequestException(
        t(
          {
            id: 'exports.tooMany',
            defaultMessage:
              'More than {limit, number} rows match. Narrow the dates or filters, and export again.',
          },
          { limit: EXPORT_LIMIT },
        ),
      );
    }
    if (!nextCursor) return rows;
    before = nextCursor;
  }
}

/**
 * The file: headers in the reader's language, then a row per record, sent
 * as an attachment named for the list and today, `invoices-2026-10-07.csv`.
 */
export function csvFile<T>(
  res: Response,
  name: string,
  columns: ExportColumn<T>[],
  rows: T[],
  locale: Locale,
): string {
  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${name}-${today}.csv"`,
  );

  return toCsv(
    columns.map((column) => translate(column.header, locale)),
    rows.map((row) => columns.map((column) => column.value(row))),
  );
}

/**
 * What the audit entry keeps of an export's query: its filters, without
 * the paging, which an export ignores.
 */
export function exportFilters(query: object): Record<string, unknown> {
  const filters: Record<string, unknown> = { ...query };
  delete filters.before;
  delete filters.limit;
  return filters;
}
