import type { Location, StockLotRow } from '../api/types.gen';

/**
 * The places stock can sit in, under the place at the top of the tree
 * they are in, their warehouse or site (20a), each group by name as the
 * tree sends them.
 */
export function byWarehouse(
  all: Location[],
  leaves: Location[],
): [Location, Location[]][] {
  const byId = new Map(all.map((location) => [location.id, location]));
  const topOf = (location: Location): Location => {
    let at = location;
    const seen = new Set<string>();
    while (at.parentId && byId.has(at.parentId) && !seen.has(at.id)) {
      seen.add(at.id);
      at = byId.get(at.parentId)!;
    }
    return at;
  };

  const groups = new Map<string, [Location, Location[]]>();
  for (const leaf of leaves) {
    const top = topOf(leaf);
    const entry = groups.get(top.id) ?? [top, []];
    entry[1].push(leaf);
    groups.set(top.id, entry);
  }
  return [...groups.values()];
}

/** Each row with which of its lot's places it is, by the rows read so far. */
export function withPlaceNumbers(
  rows: StockLotRow[],
): { row: StockLotRow; index: number }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const index = (seen.get(row.lotId ?? row.id) ?? 0) + 1;
    seen.set(row.lotId ?? row.id, index);
    return { row, index };
  });
}
