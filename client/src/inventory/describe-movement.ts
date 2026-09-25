import type { Movement } from '../lib/types';

/**
 * How a movement reads in a table: a sign for the quantity, and where.
 *
 * Direction is which location is set, not a column (ADR-023), so it is
 * reconstructed here the same way the service validates it — a transfer has
 * both ends and no sign, stock arriving has only a destination (+), stock
 * leaving only a source (−). One copy, so the movements page and the history
 * dialog cannot show the same row two ways.
 */
export function describeMovement(movement: Movement): {
  sign: string;
  where: string;
} {
  if (movement.fromLocationName && movement.toLocationName) {
    return {
      sign: '',
      where: `${movement.fromLocationName} → ${movement.toLocationName}`,
    };
  }

  return movement.toLocationName
    ? { sign: '+', where: movement.toLocationName }
    : { sign: '−', where: movement.fromLocationName ?? '—' };
}
