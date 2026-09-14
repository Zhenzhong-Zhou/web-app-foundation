import type { Location } from '../lib/types';

/**
 * The server returns the tree flat, ordered by name, and the client nests it —
 * a recursive CTE is not worth it at tens of rows, and the flat list is what
 * the parent picker needs anyway (ADR-024).
 *
 * Orphans are included at the top rather than dropped. A location whose parent
 * is missing should be visible and fixable, not invisible; silently hiding
 * rows is how a tree loses data nobody can find again.
 */
export function childrenOf(
  all: Location[],
  parentId: string | null,
): Location[] {
  const ids = new Set(all.map((location) => location.id));

  return all.filter((location) =>
    parentId === null
      ? location.parentId === null || !ids.has(location.parentId)
      : location.parentId === parentId,
  );
}

/**
 * Stock sits only at leaves (ADR-024), so any "where does this go" picker
 * wants these rather than the whole tree.
 */
export function leavesOf(locations: Location[]): Location[] {
  const parents = new Set(
    locations.map((location) => location.parentId).filter(Boolean),
  );

  return locations.filter((location) => !parents.has(location.id));
}
