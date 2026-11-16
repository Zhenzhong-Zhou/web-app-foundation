/** A row of a tree the server sends flat: its id and its parent's. */
export interface TreeRow {
  id: string;
  parentId: string | null;
}

/**
 * A flat list nested by parent, the one way the client does it (#551's
 * 64): the locations' tree, the categories' and Items' category filter.
 * The server sends a tree flat, ordered by name, and the client nests it:
 * a recursive CTE is not worth it at tens of rows, and the flat list is
 * what a parent picker needs anyway (ADR-024).
 * The children are mapped once, so each row's are read without going
 * through the whole list again, and each keeps the list's order, the
 * server's by name.
 *
 * `childrenOf(null)` is the top. A row whose parent is not in the list is
 * there too rather than dropped: a row whose parent is missing should be
 * visible and fixable, not invisible; silently hiding rows is how a tree
 * loses data nobody can find again.
 */
export function treeOf<T extends TreeRow>(
  rows: readonly T[],
): (parentId: string | null) => T[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    const parent =
      row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const siblings = children.get(parent);
    if (siblings) siblings.push(row);
    else children.set(parent, [row]);
  }

  return (parentId) => children.get(parentId) ?? [];
}
