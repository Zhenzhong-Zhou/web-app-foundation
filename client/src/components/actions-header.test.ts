import { describe, expect, it } from 'vitest';

/**
 * Every list's source, its tests left out: a list on the shared table
 * names its row actions' header with ActionsHeader, so a table too wide
 * pins them at its end (E12a). A header cell written by hand, as a new
 * list might, gets no pin and no test of its own would notice.
 */
const SOURCES = import.meta.glob<string>(
  ['../**/*.tsx', '!../**/*.test.tsx', '!./actions-header.tsx'],
  { query: '?raw', import: 'default', eager: true },
);

/** The words an actions column's header carries. */
const ACTIONS_WORDS =
  /'common\.actions'|'orders\.lines\.actions'|'common\.edit'/;

/** Each header cell of each table head in a source, to the next cell. */
function headerCells(source: string): string[] {
  const heads = source.match(/<TableHead>[\s\S]*?<\/TableHead>/g) ?? [];
  return heads.flatMap((head) =>
    head.split(/(?=<TableCell\b|<SortHeader\b|<ActionsHeader\b)/).slice(1),
  );
}

const LISTS = Object.entries(SOURCES).filter(([, source]) =>
  source.includes('<ListTable'),
);

describe('a list’s actions header (ADR-090, amended November 2026; E12a)', () => {
  it('is ActionsHeader on every list that has one', () => {
    const written = LISTS.flatMap(([file, source]) =>
      headerCells(source)
        .filter(
          (cell) =>
            cell.startsWith('<TableCell') &&
            (ACTIONS_WORDS.test(cell) || cell.includes('ACTIONS_COLUMN')),
        )
        .map(() => file),
    );

    expect(written).toEqual([]);
  });

  it('is found on the ten lists with row actions', () => {
    const using = LISTS.filter(([, source]) =>
      source.includes('<ActionsHeader'),
    ).map(([file]) => file);

    expect(using).toHaveLength(10);
  });
});
