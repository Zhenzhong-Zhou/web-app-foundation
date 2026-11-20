import type { Movement } from '../api/types.gen';

/**
 * Who made it, by name with their email beneath (ADR-063), or the email
 * alone for an account with no name. The server nulls an anonymised
 * account's email and keeps its stored name, Deleted User, which is
 * English (ADR-012); `removed` says it in the reader's words instead, and
 * `removed: true` keeps those words translatable in NameAndEmail (#245).
 */
export function movementActor(
  movement: Movement,
  removed: string,
): { name: string; email: string | null; removed?: true } {
  if (movement.actorEmail === null) {
    return { name: removed, email: null, removed: true };
  }

  return movement.actorName
    ? { name: movement.actorName, email: movement.actorEmail }
    : { name: movement.actorEmail, email: null };
}

/**
 * Which of a movement's columns a list shows (ADR-093, 11a, 85a and 91a),
 * as the server's `cardOf` reads the same filters: one code is a stock
 * card, In, Out and the balance after each row; a reason or an order
 * keeps In and Out alone; several items, the change. `places` is
 * `locations.view`: without it no row has a place to name (96a).
 */
export interface MovementColumns {
  figures: 'change' | 'inOut' | 'balance';
  places: boolean;
}

/** How many heads `MovementHeads` draws, for a list's placeholder rows. */
export function movementHeadCount(columns: MovementColumns): number {
  const figures = { change: 1, inOut: 2, balance: 3 }[columns.figures];
  return figures + (columns.places ? 5 : 4);
}

/**
 * A move between two places counted in neither In nor Out, as one code
 * across every place reads it (85a): its row says how many moved, once,
 * across both columns, which the sums leave out (118a).
 */
export function movedInNeither(movement: Movement): boolean {
  return (
    movement.reason === 'transfer' &&
    movement.quantityIn === null &&
    movement.quantityOut === null
  );
}
