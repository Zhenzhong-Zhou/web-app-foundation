import type { Movement } from '../api/types.gen';

/**
 * How a movement reads in a table: a sign for the quantity, and where.
 *
 * Direction is which location is set, not a column (ADR-023), so it is
 * reconstructed here the same way the service validates it — a transfer has
 * both ends and no sign, stock arriving has only a destination (+), stock
 * leaving only a source (−). Read from the ends' ids, which every reader
 * gets: a reader without locations.view gets no place's name (ADR-093,
 * 96a), and a dash where it would be. One copy, so the movements page and
 * the history dialog cannot show the same row two ways.
 */
export function describeMovement(movement: Movement): {
  sign: string;
  where: string;
} {
  const from = movement.fromLocationName;
  const to = movement.toLocationName;

  if (movement.fromLocationId && movement.toLocationId) {
    return { sign: '', where: from && to ? `${from} → ${to}` : '—' };
  }

  return movement.toLocationId
    ? { sign: '+', where: to ?? '—' }
    : { sign: '−', where: from ?? '—' };
}

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
