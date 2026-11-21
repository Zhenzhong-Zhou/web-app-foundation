import { describe, expect, it } from 'vitest';

/**
 * Every list's source, its tests left out: a list on the shared table
 * marks its name column, so a table too wide for its box pins the name
 * wherever it stands (ADR-090, amended November 2026; 81a), or is named
 * below as having none, its first column pinned. A list too wide with
 * neither pins whatever column comes first, which no test of its own
 * would notice.
 */
const SOURCES = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The lists with no name column, each pinning its first, and why. */
const NO_NAME: Record<string, string> = {
  '../account/recent-activity.tsx': 'a log: what was done, newest first',
  '../audit/audit-page.tsx': 'a log: what was done, newest first',
  '../settings/exchange-rates-page.tsx': 'a rate a day, by its day',
  '../production/production-orders-page.tsx':
    'runs by the day planned, the row’s Open its way in',
};

/** Each header cell of a table's head, to the next cell. */
function headerCells(table: string): string[] {
  const head = table.match(/<TableHead>[\s\S]*?<\/TableHead>/)?.[0] ?? '';
  return head.split(/(?=<TableCell\b|<SortHeader\b|<ActionsHeader\b)/).slice(1);
}

/** A header cell marked as the name: NAME_COLUMN, or SortHeader's `name`. */
const marksName = (cell: string) =>
  cell.includes('NAME_COLUMN') ||
  (cell.startsWith('<SortHeader') && /\sname[\s/>]/.test(cell));

/** Each table on the shared table, with its file. */
const TABLES = Object.entries(SOURCES).flatMap(([file, source]) =>
  (source.match(/<ListTable\b[\s\S]*?<\/ListTable>/g) ?? []).map((table) => ({
    file,
    names: headerCells(table).filter(marksName).length,
  })),
);

describe('a list’s name column (ADR-090, amended November 2026; 81a)', () => {
  it('is marked once on every list that has one', () => {
    const unmarked = TABLES.filter(
      ({ file, names }) => !(file in NO_NAME) && names !== 1,
    ).map(({ file }) => file);

    expect(unmarked).toEqual([]);
  });

  it('is marked on none of the lists named as having none', () => {
    const marked = TABLES.filter(
      ({ file, names }) => file in NO_NAME && names > 0,
    ).map(({ file }) => file);

    expect(marked).toEqual([]);
  });

  it('names only lists on the shared table as having none', () => {
    const files = new Set(TABLES.map(({ file }) => file));

    expect(Object.keys(NO_NAME).filter((file) => !files.has(file))).toEqual([]);
  });

  it('is found on the 23 tables of 22 lists', () => {
    expect(TABLES).toHaveLength(23);
  });
});
