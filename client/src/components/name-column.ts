/**
 * A list's name column in a `ListTable`, marked on its header cell
 * (`<TableCell {...NAME_COLUMN}>`, or `SortHeader`'s `name`), as the row's
 * actions are (`ACTIONS_COLUMN`). Too wide for its box, the table pins it
 * wherever it stands: a column before it, as Movements' When, passes under
 * it as the box scrolls. A list with no name column marks none, and its
 * first column is pinned, or the cell after a tick box (ADR-090, amended
 * November 2026; 81a). `name-column.test.ts` holds every list to one or
 * the other.
 */
export const NAME_COLUMN = { 'data-name': '' } as const;

/**
 * A list's name itself, its link or its text, in the name column
 * (`CutName`): pinned in a table too wide for its box, `ListTable` cuts
 * it at two lines with "…" (ADR-090, amended November 2026; 83a).
 */
export const CUT_NAME = { 'data-cut-name': '' } as const;
