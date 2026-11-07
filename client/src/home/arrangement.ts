import type { HomeResponse } from '../api/types.gen';
import type { HomeKind } from '../lib/api-names';
import { CARDS, type KnownCard } from './home-cards';

/**
 * Customise Home's arrangement (ADR-091, amended November 2026), the
 * layout Done saves: every tile the person may see, in their order, the
 * hidden ones kept in their places, so Show puts one back where it was;
 * which are hidden; and whether Recently opened shows.
 */
export interface Arrangement {
  order: HomeKind[];
  hidden: HomeKind[];
  recent: boolean;
}

/** Home as it came: the server's order, which it hid, and Recently opened. */
export function arrangementOf(
  cards: readonly KnownCard[],
  recent: boolean,
): Arrangement {
  return {
    order: cards.map((card) => card.kind),
    hidden: cards.filter((card) => card.hidden).map((card) => card.kind),
    recent,
  };
}

/**
 * The reader's default, as the server sends it beside the tiles: what
 * Reset to default puts back, and what Done compares with. Only the kinds
 * this build knows, as the tiles are.
 */
export function defaultOf(
  home: Pick<HomeResponse, 'defaultLayout'>,
): Arrangement {
  const known = (kind: HomeKind) => Object.hasOwn(CARDS, kind);
  const { order, hidden, recent } = home.defaultLayout;
  return { order: order.filter(known), hidden: hidden.filter(known), recent };
}

/** The tiles Home shows, in their order. */
export function shownOf(arrangement: Arrangement): HomeKind[] {
  return arrangement.order.filter((kind) => !arrangement.hidden.includes(kind));
}

/**
 * A tile moved one place up (-1) or down (1) among those shown, trading
 * places with the next one shown that way; a hidden tile between keeps its
 * place. At either end, unchanged.
 */
export function moved(
  arrangement: Arrangement,
  kind: HomeKind,
  by: -1 | 1,
): Arrangement {
  const { order, hidden } = arrangement;
  const at = order.indexOf(kind);
  if (at < 0) return arrangement;
  let to = at + by;
  while (to >= 0 && to < order.length && hidden.includes(order[to])) {
    to += by;
  }
  if (to < 0 || to >= order.length) return arrangement;
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return { ...arrangement, order: next };
}

/**
 * A tile dragged to another place among those shown (0 the first): one
 * move for each place between, so a hidden tile on the way keeps its place,
 * as Up and Down leave it. A place past either end is that end.
 */
export function placed(
  arrangement: Arrangement,
  kind: HomeKind,
  to: number,
): Arrangement {
  const shown = shownOf(arrangement);
  const from = shown.indexOf(kind);
  if (from < 0) return arrangement;
  const end = Math.min(Math.max(to, 0), shown.length - 1);
  const by = end < from ? -1 : 1;
  let next = arrangement;
  for (let at = from; at !== end; at += by) next = moved(next, kind, by);
  return next;
}

/** A tile hidden, kept in its place. */
export function hide(arrangement: Arrangement, kind: HomeKind): Arrangement {
  if (arrangement.hidden.includes(kind)) return arrangement;
  return { ...arrangement, hidden: [...arrangement.hidden, kind] };
}

/** A hidden tile shown again, in the place it kept. */
export function show(arrangement: Arrangement, kind: HomeKind): Arrangement {
  return {
    ...arrangement,
    hidden: arrangement.hidden.filter((each) => each !== kind),
  };
}

/** Whether two arrangements are the same: order, hidden and Recently opened. */
export function sameArrangement(a: Arrangement, b: Arrangement): boolean {
  return (
    a.recent === b.recent &&
    a.order.length === b.order.length &&
    a.order.every((kind, index) => b.order[index] === kind) &&
    a.hidden.length === b.hidden.length &&
    a.hidden.every((kind) => b.hidden.includes(kind))
  );
}
