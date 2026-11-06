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
 * At most three across, and three only from a page 600 px wide (ADR-091),
 * Home's own width, which a window of about 648 px gives beside its
 * gutters.
 */
const MOST = 3;
const THREE_FROM = 600;

/**
 * Home's tiles in even rows: one column until two fit, then two, then
 * three from 600 px wide, never more, so a tile stays large enough to
 * read across a room (ADR-091). A container query at each width where one
 * more tile fits and the columns change. The grid's parent sets
 * `containerType: 'inline-size'`, so Help beside the page counts. The
 * widths are rem, as the tile is, so the rows stay even at every text
 * size (ADR-075).
 */
export function evenRowsSx(count: number): SxProps<Theme> {
  const queries: [string, { gridTemplateColumns: string }][] = [];
  let columns = 1;
  for (let fit = 2; fit <= Math.min(count, MOST); fit += 1) {
    const next = evenColumns(count, fit);
    if (next === columns) continue;
    columns = next;
    const fits = `(min-width: calc(${rem(fit * TILE)} + ${(fit - 1) * GAP}px))`;
    queries.push([
      fit === MOST
        ? `@container ${fits} and (min-width: ${THREE_FROM}px)`
        : `@container ${fits}`,
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
