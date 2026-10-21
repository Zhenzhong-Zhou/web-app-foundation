import type { CataloguePermission, Permission } from '../api/types.gen';

/**
 * What the role editor's boxes do to each other (ADR-080). The needs are
 * the server's, from the catalogue (`permissions.ts`'s PERMISSION_NEEDS),
 * never written again here: ticking a box ticks what it needs, and what
 * that needs in turn; unticking one unticks whatever needs it, in turn;
 * the three every role holds stay ticked. Kept apart from the page so the
 * walk is tested without one.
 */
export interface Change {
  granted: Set<Permission>;
  /** What changed beyond the boxes asked for, in the catalogue's order. */
  also: Permission[];
}

/** The boxes ticked, with everything they need. */
export function tick(
  catalogue: readonly CataloguePermission[],
  granted: ReadonlySet<Permission>,
  keys: readonly Permission[],
): Change {
  const needs = new Map(catalogue.map((each) => [each.key, each.needs]));
  const next = new Set(granted);
  const waiting = [...keys];
  for (let key = waiting.pop(); key; key = waiting.pop()) {
    if (next.has(key)) continue;
    next.add(key);
    waiting.push(...(needs.get(key) ?? []));
  }
  return changed(catalogue, granted, next, keys);
}

/**
 * The boxes unticked, with everything that needs them; a locked one
 * stays, and so then does nothing that needs it come off for its sake.
 */
export function untick(
  catalogue: readonly CataloguePermission[],
  granted: ReadonlySet<Permission>,
  keys: readonly Permission[],
): Change {
  const locked = new Set(
    catalogue.filter((each) => each.locked).map((each) => each.key),
  );
  const next = new Set(granted);
  const waiting = keys.filter((key) => !locked.has(key));
  for (let key = waiting.pop(); key; key = waiting.pop()) {
    if (!next.delete(key)) continue;
    for (const each of catalogue) {
      if (each.needs.includes(key) && !locked.has(each.key)) {
        waiting.push(each.key);
      }
    }
  }
  return changed(catalogue, granted, next, keys);
}

/** Every role's three, and those a template or a copy ticks. */
export function startingWith(
  catalogue: readonly CataloguePermission[],
  keys: readonly Permission[],
): Set<Permission> {
  return tick(
    catalogue,
    new Set(),
    [
      ...catalogue.filter((each) => each.locked).map((each) => each.key),
      ...keys,
    ].filter((key) => offered(catalogue, key)),
  ).granted;
}

/**
 * Whether a box is in the editor at all: what stays the Owners' is
 * never offered (ADR-080).
 */
export function offered(
  catalogue: readonly CataloguePermission[],
  key: Permission,
): boolean {
  return catalogue.find((each) => each.key === key)?.offered ?? false;
}

function changed(
  catalogue: readonly CataloguePermission[],
  before: ReadonlySet<Permission>,
  after: Set<Permission>,
  asked: readonly Permission[],
): Change {
  return {
    granted: after,
    also: catalogue
      .map((each) => each.key)
      .filter(
        (key) => before.has(key) !== after.has(key) && !asked.includes(key),
      ),
  };
}
