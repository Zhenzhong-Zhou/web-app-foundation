/**
 * A row of a `ListTable` whose cells do not stand under its columns: an
 * opened row's detail, or a line across the row, a cell spanning several
 * columns with an empty one after it. Too wide for its box, the table pins
 * none of its cells, so an empty one never covers what spans beside it
 * (ADR-090, amended November 2026; E12a).
 */
export const SPANNING_ROW = { 'data-spans': '' } as const;
