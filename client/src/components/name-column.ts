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
