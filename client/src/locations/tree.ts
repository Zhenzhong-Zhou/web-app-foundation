import type { Location } from '../api/types.gen';

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
