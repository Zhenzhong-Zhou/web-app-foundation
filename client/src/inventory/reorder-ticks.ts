import type { ReorderPointRow } from '../api/types.gen';

/**
 * Reorder's ticked rows, kept against the list's own entry in the history
 * when Buy leaves it for a new purchase order, so that Back finds them
 * ticked (ADR-093's Reorder table: "Reorder, ticks kept"); forgotten once
 * the order is raised, so Back from it finds none ("ticks cleared"). In
 * this tab's session only; without storage, Back finds none.
 */
const KEY = 'reorderTicks';

/** Left for a new purchase order from the entry `entry` with these ticked. */
export function keepTicks(entry: string, rows: ReorderPointRow[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ entry, rows }));
  } catch {
    // No storage: Back finds the rows unticked.
  }
}

/** The rows ticked when the entry `entry` was left, by item. */
export function ticksOf(entry: string): Map<string, ReorderPointRow> {
  try {
    const kept = window.sessionStorage.getItem(KEY);
    if (!kept) return new Map();
    const { entry: left, rows } = JSON.parse(kept) as {
      entry: string;
      rows: ReorderPointRow[];
    };
    if (left !== entry) return new Map();
    return new Map(rows.map((row) => [row.variantId, row]));
  } catch {
    return new Map();
  }
}

/** The order filled from them is raised: no row stays ticked. */
export function forgetTicks(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was kept.
  }
}
