import { describe, expect, it } from 'vitest';

import type { ProductCategory } from '../api/types.gen';
import { categoryOptions } from './item-list';

const TREE: ProductCategory[] = [
  { id: 'vit', name: 'Vitamins', parentId: null, items: [] },
  {
    id: 'vit-c',
    name: 'Vitamin C',
    parentId: 'vit',
    items: [
      { type: 'good', active: 2, discontinued: 1 },
      { type: 'material', active: 5, discontinued: 0 },
    ],
  },
  {
    id: 'vit-d',
    name: 'Vitamin D',
    parentId: 'vit',
    items: [{ type: 'good', active: 0, discontinued: 3 }],
  },
  {
    id: 'oil',
    name: 'Fish oil',
    parentId: null,
    items: [{ type: 'material', active: 1, discontinued: 0 }],
  },
];

const shown = (options: ReturnType<typeof categoryOptions>) =>
  options.map((option) => [option.name, option.depth, option.count]);

/**
 * The filter offers the categories holding items on the open tab, each
 * counting those under it too (ADR-092), as Discontinued leaves the list.
 */
describe('categoryOptions', () => {
  it('counts each category with those under it, on the open tab alone', () => {
    expect(shown(categoryOptions(TREE, 'good', '', ''))).toEqual([
      ['Vitamins', 0, 2],
      ['Vitamin C', 1, 2],
    ]);
    expect(shown(categoryOptions(TREE, 'all', '', ''))).toEqual([
      ['Vitamins', 0, 7],
      ['Vitamin C', 1, 7],
      ['Fish oil', 0, 1],
    ]);
  });

  it('counts the discontinued alone, or beside the rest, as the list shows them', () => {
    expect(shown(categoryOptions(TREE, 'good', 'only', ''))).toEqual([
      ['Vitamins', 0, 4],
      ['Vitamin C', 1, 1],
      ['Vitamin D', 1, 3],
    ]);
    expect(shown(categoryOptions(TREE, 'good', 'include', ''))).toEqual([
      ['Vitamins', 0, 6],
      ['Vitamin C', 1, 3],
      ['Vitamin D', 1, 3],
    ]);
  });

  it('keeps the chosen category while the tab holds none of it, with its path', () => {
    const options = categoryOptions(TREE, 'good', '', 'vit-d');

    expect(shown(options)).toContainEqual(['Vitamin D', 1, 0]);
    expect(options.find((option) => option.id === 'vit-d')?.path).toEqual([
      'Vitamins',
      'Vitamin D',
    ]);
  });
});
