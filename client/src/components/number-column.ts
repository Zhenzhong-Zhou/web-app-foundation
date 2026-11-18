/**
 * A number column in a `ListTable`, marked on its header cell
 * (`<TableCell {...NUMBER_COLUMN}>`, or `SortHeader`'s `number`):
 * right-aligned, and as wide as its header and figures need, the text
 * columns taking the rest (ADR-090, amended November 2026; E1). Its body
 * cells are right-aligned, which the theme keeps on one line.
 */
export const NUMBER_COLUMN = { align: 'right', 'data-number': '' } as const;
