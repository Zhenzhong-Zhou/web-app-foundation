import { describe, expect, it } from 'vitest';

import type { Permission } from '../auth/permissions';
import type { HomeKind } from '../lib/api-names';
import {
  type Arrangement,
  arrangementOf,
  byDefault,
  hide,
  moved,
  sameArrangement,
  show,
  shownOf,
} from './arrangement';
import type { KnownCard } from './home-cards';

const EVERY: HomeKind[] = [
  'toShip',
  'toReceive',
  'drafts',
  'lowStock',
  'expiring',
  'costsWaiting',
  'invoicesToIssue',
  'returnsOpen',
  'production',
  'licences',
];

const holding =
  (...held: Permission[]) =>
  (permission: Permission) =>
    held.includes(permission);

const card = (kind: HomeKind, hidden = false): KnownCard => ({
  kind,
  hidden,
  count: 0,
  late: 0,
  anyPoint: null,
});

describe('arrangementOf', () => {
  it('takes Home’s order, the hidden among it, and Recently opened', () => {
    expect(
      arrangementOf(
        [card('toReceive'), card('drafts', true), card('toShip')],
        false,
      ),
    ).toEqual({
      order: ['toReceive', 'drafts', 'toShip'],
      hidden: ['drafts'],
      recent: false,
    });
  });
});

describe('byDefault', () => {
  // ADR-091, amended November 2026: an Owner's Home is as it was.
  it('keeps the working day’s order for whoever does all the work', () => {
    const owner = byDefault(EVERY, () => true);

    expect(owner.order).toEqual(EVERY);
    expect(owner.hidden).toEqual(['drafts']);
    expect(owner.recent).toBe(true);
  });

  it('leads with the work the member may do, the rest after, each in order', () => {
    const warehouse = byDefault(
      EVERY,
      holding('orders.ship', 'orders.receive', 'stock.adjust'),
    );

    expect(warehouse.order).toEqual([
      'toShip',
      'toReceive',
      'expiring',
      'drafts',
      'lowStock',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'production',
      'licences',
    ]);
  });

  it('leads with Low stock for whoever raises orders or plans runs', () => {
    expect(
      byDefault(EVERY, holding('production.create')).order.slice(0, 2),
    ).toEqual(['lowStock', 'toShip']);
    expect(
      byDefault(EVERY, holding('orders.create')).order.slice(0, 3),
    ).toEqual(['drafts', 'lowStock', 'toShip']);
  });

  it('holds only the kinds the member sees, drafts hidden only when seen', () => {
    expect(
      byDefault(['licences', 'expiring'], holding('product_licences.update')),
    ).toEqual({ order: ['licences', 'expiring'], hidden: [], recent: true });
  });
});

describe('moving, hiding and showing', () => {
  const start: Arrangement = {
    order: ['toShip', 'toReceive', 'drafts', 'lowStock', 'expiring'],
    hidden: ['drafts'],
    recent: true,
  };

  it('moves a tile one place among those shown', () => {
    expect(moved(start, 'toReceive', -1).order).toEqual([
      'toReceive',
      'toShip',
      'drafts',
      'lowStock',
      'expiring',
    ]);
    expect(moved(start, 'lowStock', 1).order).toEqual([
      'toShip',
      'toReceive',
      'drafts',
      'expiring',
      'lowStock',
    ]);
  });

  it('moves past a hidden tile, which keeps its place', () => {
    const up = moved(start, 'lowStock', -1);

    expect(up.order).toEqual([
      'toShip',
      'lowStock',
      'drafts',
      'toReceive',
      'expiring',
    ]);
    expect(shownOf(up)).toEqual([
      'toShip',
      'lowStock',
      'toReceive',
      'expiring',
    ]);
    expect(moved(up, 'lowStock', 1)).toEqual(start);
  });

  it('leaves the first shown where it is going up, and the last going down', () => {
    const shipHidden = hide(start, 'toShip');

    expect(moved(shipHidden, 'toReceive', -1)).toBe(shipHidden);
    expect(moved(start, 'expiring', 1)).toBe(start);
  });

  it('hides a tile in its place, and shows it there again', () => {
    const hidden = hide(start, 'toReceive');

    expect(hidden.order).toEqual(start.order);
    expect(shownOf(hidden)).toEqual(['toShip', 'lowStock', 'expiring']);
    expect(shownOf(show(hidden, 'toReceive'))).toEqual([
      'toShip',
      'toReceive',
      'lowStock',
      'expiring',
    ]);
    expect(shownOf(show(start, 'drafts'))).toEqual(start.order);
  });
});

describe('sameArrangement', () => {
  const owner = byDefault(EVERY, () => true);

  // What Done compares with the default: equal, it clears the layout, so
  // the person follows later defaults.
  it('finds the default after moves undone, a tile hidden and shown, or a reset', () => {
    const there = moved(owner, 'expiring', -1);
    const back = moved(there, 'expiring', 1);
    const hiddenAndShown = show(hide(owner, 'toShip'), 'toShip');

    expect(sameArrangement(back, owner)).toBe(true);
    expect(sameArrangement(hiddenAndShown, owner)).toBe(true);
    expect(sameArrangement(there, owner)).toBe(false);
    expect(
      sameArrangement(
        byDefault(EVERY, () => true),
        owner,
      ),
    ).toBe(true);
  });

  it('tells apart the hidden, whatever their order, and Recently opened', () => {
    const two = hide(hide(owner, 'toShip'), 'licences');
    const twoOtherWay = { ...two, hidden: [...two.hidden].reverse() };

    expect(sameArrangement(two, twoOtherWay)).toBe(true);
    expect(sameArrangement(show(owner, 'drafts'), owner)).toBe(false);
    expect(sameArrangement({ ...owner, recent: false }, owner)).toBe(false);
  });
});
