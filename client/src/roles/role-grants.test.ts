import { describe, expect, it } from 'vitest';

import type { CataloguePermission, Permission } from '../api/types.gen';
import { offered, startingWith, tick, untick } from './role-grants';

/** Part of the server's catalogue, its needs as permissions.ts has them. */
function permission(
  key: Permission,
  needs: Permission[] = [],
  over: Partial<CataloguePermission> = {},
): CataloguePermission {
  return {
    key,
    line: key,
    note: null,
    needs,
    offered: true,
    locked: false,
    ...over,
  };
}

const CATALOGUE: CataloguePermission[] = [
  permission('users.view', [], { locked: true }),
  permission('roles.view', [], { locked: true }),
  permission('roles.create', ['roles.view'], { offered: false }),
  permission('products.view'),
  permission('locations.view'),
  permission('stock.view'),
  permission('stock.move', ['stock.view', 'products.view', 'locations.view']),
  permission('stock.adjust', ['stock.move']),
  permission('partners.view'),
  permission('orders.view'),
  permission('orders.view_prices', ['orders.view']),
  permission('orders.create', [
    'orders.view_prices',
    'partners.view',
    'products.view',
  ]),
  permission('orders.receive', ['orders.view', 'locations.view']),
];

const LOCKED: Permission[] = ['users.view', 'roles.view'];

describe('the role editor’s boxes', () => {
  it('tick what a box needs with it, and what that needs, in the catalogue’s order', () => {
    const { granted, also } = tick(CATALOGUE, new Set(LOCKED), [
      'stock.adjust',
    ]);

    expect(also).toEqual([
      'products.view',
      'locations.view',
      'stock.view',
      'stock.move',
    ]);
    expect(granted).toEqual(
      new Set([...LOCKED, 'stock.adjust', ...also] as Permission[]),
    );
  });

  it('say nothing more when what a box needs is already ticked', () => {
    const start = new Set<Permission>([
      ...LOCKED,
      'orders.view',
      'locations.view',
    ]);

    expect(tick(CATALOGUE, start, ['orders.receive']).also).toEqual([]);
  });

  it('untick whatever needs a box, and whatever needs that', () => {
    const start = tick(CATALOGUE, new Set(LOCKED), [
      'stock.adjust',
      'orders.receive',
      'orders.create',
    ]).granted;

    const { granted, also } = untick(CATALOGUE, start, ['locations.view']);

    expect(also).toEqual(['stock.move', 'stock.adjust', 'orders.receive']);
    expect(granted.has('orders.create')).toBe(true);
    expect(granted.has('products.view')).toBe(true);
  });

  it('never untick the three every role holds', () => {
    const { granted, also } = untick(CATALOGUE, new Set(LOCKED), LOCKED);

    expect(granted).toEqual(new Set(LOCKED));
    expect(also).toEqual([]);
  });

  it('start a copy of Owner without what stays the Owners’', () => {
    const everything = CATALOGUE.map((each) => each.key);
    const granted = startingWith(CATALOGUE, everything);

    expect(granted.has('roles.create')).toBe(false);
    expect(offered(CATALOGUE, 'roles.create')).toBe(false);
    expect(granted.size).toBe(everything.length - 1);
  });

  it('start from nothing with the three every role holds', () => {
    expect(startingWith(CATALOGUE, [])).toEqual(new Set(LOCKED));
  });
});
