import { describe, expect, it } from 'vitest';

import { byKind, type LookupKind } from './lookup.service';

/** A pass's row as a branch selects it, only its kind and place set. */
const row = (kind: LookupKind, position: number, title: string) => ({
  kind,
  position,
  id: `${kind}-${position}`,
  title,
  variantName: kind === 'item' ? 'Large' : null,
  detail: null,
  status: null,
  expiresAt: null,
  productId: null,
  coverFileId: null,
});

describe('byKind', () => {
  // SQL promises no order for a union all's rows (ADR-051's amendment for
  // #225): each kind's order is its rows' places, not the order they came.
  it("keeps each kind's rows in its branch's order, however the union all returns them", () => {
    const grouped = byKind([
      row('partner', 2, 'Harbour West'),
      row('item', 3, 'Tea 4'),
      row('partner', 1, 'Harbour'),
      row('item', 1, 'Tea 6'),
      row('item', 2, 'Tea 5'),
    ]);

    expect(grouped.get('item')?.map((r) => r.title)).toEqual([
      'Tea 6 (Large)',
      'Tea 5 (Large)',
      'Tea 4 (Large)',
    ]);
    expect(grouped.get('partner')?.map((r) => r.title)).toEqual([
      'Harbour',
      'Harbour West',
    ]);
    // Its place is the query's, never the response's.
    expect(grouped.get('partner')?.[0]).not.toHaveProperty('position');
  });
});
