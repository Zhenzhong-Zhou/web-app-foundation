import type { SxProps, Theme } from '@mui/material';

import { rem } from '../theme/rem';

/** A tile's narrowest at the standard text size, and the space between. */
const TILE = 150;
const GAP = 12;

/**
 * How many columns `count` tiles take when `fit` of them fit across
 * (ADR-081): as few rows as the width needs, the tiles shared evenly
 * across them. Eight where seven fit are two rows of four, not seven and
 * one alone; seven where six fit are four and three.
 */
export function evenColumns(count: number, fit: number): number {
  const rows = Math.ceil(count / Math.max(1, Math.min(fit, count)));
  return Math.ceil(count / rows);
}

/**
 * Home's tiles in even rows: one column until two fit, then a container
 * query at each width where one more tile fits and the columns change.
 * The grid's parent sets `containerType: 'inline-size'`. The widths are
 * rem, as the tile is, so the rows stay even at every text size (ADR-075).
 */
export function evenRowsSx(count: number): SxProps<Theme> {
  const queries: [string, { gridTemplateColumns: string }][] = [];
  let columns = 1;
  for (let fit = 2; fit <= count; fit += 1) {
    const next = evenColumns(count, fit);
    if (next === columns) continue;
    columns = next;
    queries.push([
      `@container (min-width: calc(${rem(fit * TILE)} + ${(fit - 1) * GAP}px))`,
      { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` },
    ]);
  }
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: `${GAP}px`,
    ...Object.fromEntries(queries),
  };
}
