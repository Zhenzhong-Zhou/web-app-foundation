/**
 * The pointer's two questions, asked one way everywhere (ADR-091's
 * review): a fingertip's sizes on touch, and a hover's tint only under a
 * mouse, since a touch screen leaves one stuck after a tap.
 */
export const TOUCH = '@media (pointer: coarse)';
export const HOVER = '@media (hover: hover)';

/**
 * A window tall enough for a row to stay fixed under the top bar: under
 * about 700 px (a phone held sideways, the Duo open or closed) nothing
 * fixed takes more than the bar (the design language, Screen sizes).
 */
export const TALL_WINDOW = '@media (min-height: 700px)';

/**
 * A window where a list's header stays under the top bar as the page
 * scrolls (ADR-090, amended November 2026): 500 px tall from `lg`, where
 * only a laptop's window is that short (Q1b), and 700 px from `md`, a
 * tablet held sideways (E9b). On a screen alone, so a printed list's
 * header is a plain header row. The query alone is for `matchMedia`,
 * which asks the list again when a window crosses it; CSS decides.
 */
export const HEADER_STAYS_QUERY =
  'screen and (min-width: 1200px) and (min-height: 500px), screen and (min-width: 900px) and (min-height: 700px)';
export const HEADER_STAYS = `@media ${HEADER_STAYS_QUERY}`;

/**
 * A table's cell shown from 900 px (`md`), gone between 600 and 899 px
 * with its header, as Held, Coming and In draft are (ADR-093, R14); and
 * its narrow copy, shown below 900 px alone.
 */
export const WIDE_ONLY = { display: { xs: 'none', md: 'table-cell' } } as const;
export const NARROW_ONLY = { display: { md: 'none' } } as const;
