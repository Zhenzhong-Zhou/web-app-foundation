/**
 * The row a person left a list from, kept against the list's own entry in
 * the history, so that Back returns focus to it (ADR-093's Stock table:
 * "Back, Stock as it was, focus on that row"). In this tab's session only;
 * a browser that keeps none simply returns to the list's start.
 */
const KEY = 'returnFocus';

/** Left from `row` on the entry `entry` (React Router's location.key). */
export function leftFrom(entry: string, row: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ entry, row }));
  } catch {
    // No storage: Back returns without focus on the row.
  }
}

/** The row left from on `entry`, once: read, it is forgotten. */
export function returnedTo(entry: string): string | null {
  try {
    const kept = window.sessionStorage.getItem(KEY);
    if (!kept) return null;
    const { entry: left, row } = JSON.parse(kept) as {
      entry: string;
      row: string;
    };
    if (left !== entry) return null;
    window.sessionStorage.removeItem(KEY);
    return row;
  } catch {
    return null;
  }
}
