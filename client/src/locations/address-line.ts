import type { Location } from '../api/types.gen';

/**
 * "42 Production Way, Burnaby": a site's address on one line (ADR-071),
 * under its name in Locations and beside it wherever a site is chosen.
 * Its own module, since a component's file may export only components for
 * Fast Refresh to keep its state.
 */
export function addressLine(address: NonNullable<Location['address']>): string {
  return [address.line1, address.city].filter(Boolean).join(', ');
}
