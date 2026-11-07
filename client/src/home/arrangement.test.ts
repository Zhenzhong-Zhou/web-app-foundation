import { describe, expect, it } from 'vitest';

import type { HomeKind } from '../lib/api-names';
import {
  type Arrangement,
  arrangementOf,
  defaultOf,
  hide,
  moved,
  placed,
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

describe('defaultOf', () => {
  // ADR-091, amended November 2026: the server's, so the two cannot drift.
  it('takes the default the server sends, in the kinds this build knows', () => {
    expect(
      defaultOf({
        defaultLayout: {
          order: ['lowStock', 'weather' as HomeKind, 'drafts', 'toShip'],
          hidden: ['drafts', 'weather' as HomeKind],
          recent: true,
        },
      }),
    ).toEqual({
      order: ['lowStock', 'drafts', 'toShip'],
      hidden: ['drafts'],
      recent: true,
    });
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

  // Dragging (ADR-091, amended November 2026): as many moves as places.
  it('drags a tile to a place among those shown, as Up and Down would', () => {
    const dragged = placed(start, 'toShip', 2);

    expect(dragged).toEqual(moved(moved(start, 'toShip', 1), 'toShip', 1));
    expect(shownOf(dragged)).toEqual([
      'toReceive',
      'lowStock',
      'toShip',
      'expiring',
    ]);
    expect(dragged.order[2]).toBe('drafts');
    expect(placed(dragged, 'toShip', 0)).toEqual(start);
  });

  it('leaves a tile dropped where it was, and takes a place past an end as that end', () => {
    expect(placed(start, 'lowStock', 2)).toBe(start);
    expect(placed(start, 'drafts', 0)).toBe(start);
    expect(shownOf(placed(start, 'toShip', 9)).at(-1)).toBe('toShip');
    expect(shownOf(placed(start, 'expiring', -1))[0]).toBe('expiring');
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
  const owner: Arrangement = { order: EVERY, hidden: ['drafts'], recent: true };

  // What Done compares with the default: equal, it clears the layout, so
  // the person follows later defaults.
  it('finds the default after moves undone, a tile hidden and shown, or a reset', () => {
    const there = moved(owner, 'expiring', -1);
    const back = moved(there, 'expiring', 1);
    const hiddenAndShown = show(hide(owner, 'toShip'), 'toShip');

    expect(sameArrangement(back, owner)).toBe(true);
    expect(sameArrangement(hiddenAndShown, owner)).toBe(true);
    expect(sameArrangement(there, owner)).toBe(false);
    expect(sameArrangement({ ...owner, order: [...EVERY] }, owner)).toBe(true);
  });

  it('tells apart the hidden, whatever their order, and Recently opened', () => {
    const two = hide(hide(owner, 'toShip'), 'licences');
    const twoOtherWay = { ...two, hidden: [...two.hidden].reverse() };

    expect(sameArrangement(two, twoOtherWay)).toBe(true);
    expect(sameArrangement(show(owner, 'drafts'), owner)).toBe(false);
    expect(sameArrangement({ ...owner, recent: false }, owner)).toBe(false);
  });
});
