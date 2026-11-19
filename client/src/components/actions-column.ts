/**
 * A list's row actions in a `ListTable`, its last column, marked on its
 * header cell by `ActionsHeader`, which every list's actions header is. Too wide for its box,
 * the table pins them at its end, beside the name pinned at its start,
 * while the two take no more than half the box; past that, the name alone
 * (ADR-090, amended November 2026; E12a).
 */
export const ACTIONS_COLUMN = { 'data-actions': '' } as const;
