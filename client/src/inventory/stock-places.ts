import type { Location, StockLotRow } from '../api/types.gen';
import { nameAndCode } from '../lib/format';
import { pathName } from '../products/item-list';

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

/** What a place's path is written from, as Stock's reads send it. */
export interface Placed {
  locationName: string | null;
  locationCode: string | null;
  locationPath: string[];
}

/**
 * A place as its path, its warehouse first, "Main warehouse › Zone A ›
 * Shelf A2 (A2)" (57a): the names above it, then its own with its code,
 * joined as a category's path is. Data, not words, so the same in every
 * language.
 */
export function placeName(place: Placed): string {
  return pathName([
    ...place.locationPath,
    nameAndCode(place.locationName ?? '', place.locationCode),
  ]);
}

/**
 * Each place of a tree as its path, by its id (57a, #631): the names
 * above it, from the whole tree the server sends flat, then its own with
 * its code, as `placeName` writes a row's. For a dialog's list of places
 * and the place it names, which have the tree, not a read's path. Null
 * for a place not in the tree.
 */
export function placePaths(
  all: readonly Location[],
): (id: string) => string | null {
  const byId = new Map(all.map((location) => [location.id, location]));
  return (id) => {
    const place = byId.get(id);
    if (!place) return null;
    const above: string[] = [];
    const seen = new Set([place.id]);
    let at = place.parentId ? byId.get(place.parentId) : undefined;
    while (at && !seen.has(at.id)) {
      above.unshift(at.name);
      seen.add(at.id);
      at = at.parentId ? byId.get(at.parentId) : undefined;
    }
    return placeName({
      locationName: place.name,
      locationCode: place.code,
      locationPath: above,
    });
  };
}

/** What stands for the places cut from the middle of a path. */
const CUT = '…';

/**
 * A path's cuts in its middle, the longest first: its warehouse, "…",
 * the places nearest the place itself while they fit, then the place,
 * "Main warehouse › … › Aisle 1 › Shelf A2 (A2)" before "Main warehouse
 * › … › Shelf A2 (A2)". None for a path with nothing between its
 * warehouse and the place.
 */
export function cutsOf(above: readonly string[], own: string): string[] {
  const [warehouse, ...between] = above;
  return between.map((_, dropped) =>
    pathName([warehouse, CUT, ...between.slice(dropped + 1), own]),
  );
}

/**
 * A row's key in `?open=`: a code's id, or a place's under it as
 * `code.place`, since a place opens to its lots under each code apart
 * (ADR-093, R11: Back from a lot's Movements finds its lots open).
 */
export function openKey(variantId: string, locationId?: string): string {
  return locationId ? `${variantId}.${locationId}` : variantId;
}
