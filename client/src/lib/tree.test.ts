import { describe, expect, it } from 'vitest';

import { treeOf } from './tree';

const row = (id: string, parentId: string | null) => ({ id, parentId });

/**
 * One way to nest a flat list (#551's 64), for the locations', the
 * categories' and Items' trees.
 */
describe('treeOf', () => {
  it('gives each row its children in the list’s order, the top under null', () => {
    const childrenOf = treeOf([
      row('site', null),
      row('zone-b', 'site'),
      row('other-site', null),
      row('zone-a', 'site'),
      row('shelf', 'zone-a'),
    ]);

    expect(childrenOf(null).map((each) => each.id)).toEqual([
      'site',
      'other-site',
    ]);
    expect(childrenOf('site').map((each) => each.id)).toEqual([
      'zone-b',
      'zone-a',
    ]);
    expect(childrenOf('zone-a').map((each) => each.id)).toEqual(['shelf']);
    expect(childrenOf('shelf')).toEqual([]);
  });

  it('puts a row whose parent is not in the list at the top, never dropping it', () => {
    const childrenOf = treeOf([row('site', null), row('lost', 'gone')]);

    expect(childrenOf(null).map((each) => each.id)).toEqual(['site', 'lost']);
    expect(childrenOf('gone')).toEqual([]);
  });
});
