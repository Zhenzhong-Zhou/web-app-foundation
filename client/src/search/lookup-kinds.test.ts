import { describe, expect, it } from 'vitest';

import type { LookupResult } from '../api/types.gen';
import { listOf, pathOf } from './lookup-kinds';

describe('where an item opens', () => {
  it('opens its page under Items', () => {
    const result = { id: 'variant-1', productId: 'product-1' } as LookupResult;

    expect(pathOf('item', result)).toBe('/items/product-1');
  });

  it('opens Show all in Items on All, discontinued included, with the search (ADR-092)', () => {
    expect(listOf('item', 'calm 90')).toBe(
      '/items?tab=all&discontinued=include&search=calm%2090',
    );
  });
});
