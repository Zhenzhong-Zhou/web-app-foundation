import { describe, expect, it } from 'vitest';

import type { Location, StockLotRow } from '../api/types.gen';
import {
  byWarehouse,
  cutsOf,
  placeName,
  placePaths,
  withPlaceNumbers,
} from './stock-places';

function place(id: string, parentId: string | null = null): Location {
  return {
    id,
    type: parentId ? 'shelf' : 'site',
    name: id,
    code: null,
    parentId,
    isAvailable: true,
    isActive: true,
    address: null,
  };
}

describe('byWarehouse', () => {
  // 20a: Stock's place filter lists each place under its warehouse.
  it('groups each place under the top of its tree, in the order given', () => {
    const main = place('Main');
    const aisle = place('Aisle 1', 'Main');
    const a1 = place('A1', 'Aisle 1');
    const a2 = place('A2', 'Aisle 1');
    const annex = place('Annex');
    const b1 = place('B1', 'Annex');

    expect(
      byWarehouse([main, aisle, a1, a2, annex, b1], [a1, b1, a2]).map(
        ([top, inIt]) => [top.id, inIt.map((each) => each.id)],
      ),
    ).toEqual([
      ['Main', ['A1', 'A2']],
      ['Annex', ['B1']],
    ]);
  });

  it('stands a place whose parent is not sent, or a loop, as its own top', () => {
    const orphan = place('Lost', 'Gone');
    const loopA = place('Loop A', 'Loop B');
    const loopB = place('Loop B', 'Loop A');

    expect(
      byWarehouse([orphan, loopA, loopB], [orphan, loopA]).map(
        ([top, inIt]) => [top.id, inIt.map((each) => each.id)],
      ),
    ).toEqual([
      ['Lost', ['Lost']],
      ['Loop A', ['Loop A']],
    ]);
  });
});

describe('withPlaceNumbers', () => {
  // "1 of 2 places": a lot's piles numbered in the order read.
  it('numbers each lot’s piles in turn, a pile with no lot by itself', () => {
    const row = (id: string, lotId: string | null) =>
      ({ id, lotId }) as StockLotRow;

    expect(
      withPlaceNumbers([
        row('p1', 'lot-a'),
        row('p2', 'lot-b'),
        row('p3', 'lot-a'),
        row('p4', null),
        row('p5', 'lot-a'),
      ]).map(({ row: each, index }) => [each.id, index]),
    ).toEqual([
      ['p1', 1],
      ['p2', 1],
      ['p3', 2],
      ['p4', 1],
      ['p5', 3],
    ]);
  });
});

describe('placeName', () => {
  // 57a: a place is written as its path, its warehouse first.
  it('writes the places above it, then its own name and code', () => {
    expect(
      placeName({
        locationName: 'Shelf A2',
        locationCode: 'A2',
        locationPath: ['Main warehouse', 'Zone A'],
      }),
    ).toBe('Main warehouse › Zone A › Shelf A2 (A2)');
    expect(
      placeName({ locationName: 'BACK', locationCode: null, locationPath: [] }),
    ).toBe('BACK');
  });
});

describe('placePaths', () => {
  // #631: a dialog's places are written as their paths, from the tree.
  it('writes each place by the tree above it, and none for a place not in it', () => {
    const shelf = { ...place('Shelf A2', 'Zone A'), code: 'A2' };
    const pathOf = placePaths([
      place('Main warehouse'),
      place('Zone A', 'Main warehouse'),
      shelf,
      place('Back room'),
    ]);

    expect(pathOf('Shelf A2')).toBe('Main warehouse › Zone A › Shelf A2 (A2)');
    expect(pathOf('Back room')).toBe('Back room');
    expect(pathOf('elsewhere')).toBeNull();
  });
});

describe('cutsOf', () => {
  // Cut in its middle (93a, #639): the warehouse and the place kept, the
  // places nearest the place before those nearer the warehouse.
  it('keeps the warehouse and the place, the nearest places first', () => {
    expect(
      cutsOf(['Main warehouse', 'Ambient', 'Aisle 1'], 'Shelf 1-B (1B)'),
    ).toEqual([
      'Main warehouse › … › Aisle 1 › Shelf 1-B (1B)',
      'Main warehouse › … › Shelf 1-B (1B)',
    ]);
  });

  it('has none with nothing between the warehouse and the place', () => {
    expect(cutsOf(['Richmond warehouse'], 'Quarantine (QUAR)')).toEqual([]);
    expect(cutsOf([], 'Main warehouse')).toEqual([]);
  });
});
