import { describe, expect, it } from 'vitest';

import { keepShown, leftFrom, returnedTo, shownOn } from './return-focus';

describe('return-focus', () => {
  // Stock › Movements › a lot's trace, then Back twice: each list finds
  // the row it was left from, not only the last one left.
  it('keeps each entry’s row apart, so Back twice finds each list’s', () => {
    leftFrom('stock', 'variant-1');
    leftFrom('movements', 'movement-7', '/stock/lots/lot-1');

    expect(returnedTo('movements')).toEqual({
      row: 'movement-7',
      link: '/stock/lots/lot-1',
    });
    expect(returnedTo('stock')).toEqual({ row: 'variant-1', link: null });
  });

  it('gives the row once, keeping the rows shown for the next Back', () => {
    keepShown('stock', '/stock/by-code?limit=50', 100);
    leftFrom('stock', 'variant-1');

    expect(returnedTo('stock')?.row).toBe('variant-1');
    expect(returnedTo('stock')).toBeNull();
    expect(shownOn('stock', '/stock/by-code?limit=50')).toBe(100);
  });

  it('keeps the rows shown for the list as it was left alone', () => {
    keepShown('stock', '/stock/by-code?limit=50', 100);

    expect(shownOn('stock', '/stock/by-code?limit=50&low=true')).toBe(0);
    expect(shownOn('reorder', '/stock/by-code?limit=50')).toBe(0);
  });

  it('forgets the oldest entries past twenty', () => {
    for (let entry = 0; entry < 21; entry += 1) {
      leftFrom(`entry-${entry}`, 'row');
    }

    expect(returnedTo('entry-0')).toBeNull();
    expect(returnedTo('entry-20')?.row).toBe('row');
  });
});
