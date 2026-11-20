/**
 * A list as a person left it, kept against the list's own entry in the
 * history, so that Back returns it as it was (ADR-093's tables: "Back,
 * Stock as it was, focus on that row"; #473): the row they left from, and
 * the link in it they followed, which take focus once; and how many of its
 * rows were shown, which Back reads again after Show more (#638's P2a).
 *
 * Each entry its own, the last few kept, so Back twice, from a lot's trace
 * to Movements and on to Stock, finds each as it was left. In this tab's
 * session only; a browser that keeps none simply returns to the list's
 * start.
 */
const KEY = 'returnFocus';

/** Entries kept, the oldest forgotten first. */
const ENTRIES = 20;

/** The row left from, and the link in it followed, if one was. */
export interface Returned {
  row: string;
  link: string | null;
}

interface Kept {
  returned?: Returned;
  /** The list's first page, filters included, and how many rows it showed. */
  shown?: { path: string; rows: number };
}

function keptAll(): [string, Kept][] {
  try {
    const kept: unknown = JSON.parse(
      window.sessionStorage.getItem(KEY) ?? '[]',
    );
    return Array.isArray(kept) ? (kept as [string, Kept][]) : [];
  } catch {
    return [];
  }
}

function keptOn(entry: string): Kept {
  return keptAll().find(([each]) => each === entry)?.[1] ?? {};
}

/** The entry's record changed, and moved to the newest. */
function keep(entry: string, change: (was: Kept) => Kept): void {
  try {
    const all = keptAll();
    const was = all.find(([each]) => each === entry)?.[1] ?? {};
    const next = [
      ...all.filter(([each]) => each !== entry),
      [entry, change(was)],
    ].slice(-ENTRIES);
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // No storage: Back returns to the list's start, focus nowhere.
  }
}

/**
 * Left from `row` on the entry `entry` (React Router's location.key), by
 * the link `link` in it (its href) where one was followed.
 */
export function leftFrom(entry: string, row: string, link?: string): void {
  keep(entry, (was) => ({ ...was, returned: { row, link: link ?? null } }));
}

/** The row left from on `entry`, once: read, it is forgotten. */
export function returnedTo(entry: string): Returned | null {
  const { returned } = keptOn(entry);
  if (!returned) return null;
  keep(entry, ({ shown }) => ({ shown }));
  return returned;
}

/** The list `path` on `entry` showed `rows` of its rows. */
export function keepShown(entry: string, path: string, rows: number): void {
  keep(entry, (was) => ({ ...was, shown: { path, rows } }));
}

/** How many rows the list `path` showed when `entry` was left; 0 if none. */
export function shownOn(entry: string, path: string): number {
  const { shown } = keptOn(entry);
  return shown?.path === path ? shown.rows : 0;
}
