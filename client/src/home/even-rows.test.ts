import { describe, expect, it } from 'vitest';

import { evenColumns, evenRowsSx } from './even-rows';

describe('even rows', () => {
  it('shares the tiles evenly across as few rows as fit', () => {
    // Eight: a computer fits seven, a tablet four, a phone two.
    expect(evenColumns(8, 7)).toBe(4);
    expect(evenColumns(8, 4)).toBe(4);
    expect(evenColumns(8, 3)).toBe(3);
    expect(evenColumns(8, 2)).toBe(2);
    // Seven are four and three; five are three and two.
    expect(evenColumns(7, 6)).toBe(4);
    expect(evenColumns(7, 4)).toBe(4);
    expect(evenColumns(5, 4)).toBe(3);
    expect(evenColumns(5, 3)).toBe(3);
  });

  it('keeps one row while every tile fits in it', () => {
    expect(evenColumns(8, 8)).toBe(8);
    expect(evenColumns(7, 7)).toBe(7);
    expect(evenColumns(3, 7)).toBe(3);
    expect(evenColumns(1, 7)).toBe(1);
  });

  it('stacks the tiles where not even one fits', () => {
    expect(evenColumns(8, 1)).toBe(1);
    expect(evenColumns(8, 0)).toBe(1);
  });

  it('changes the columns where one more tile and its gap fit', () => {
    expect(evenRowsSx(8)).toEqual({
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '12px',
      // Two fit at 2 × 150 + 12 px; five to seven change nothing.
      '@container (min-width: calc(18.75rem + 12px))': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@container (min-width: calc(28.125rem + 24px))': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
      '@container (min-width: calc(37.5rem + 36px))': {
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      },
      '@container (min-width: calc(75rem + 84px))': {
        gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
      },
    });
    // A single tile has the row to itself at every width.
    expect(evenRowsSx(1)).toEqual({
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '12px',
    });
  });
});
