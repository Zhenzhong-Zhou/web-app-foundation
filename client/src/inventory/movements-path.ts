import { withQuery } from '../lib/api';

/**
 * What a way into Movements filters it to (ADR-093, R11, R12 and R24):
 * a code, at a place or of one of its lots, or an order's movements.
 */
export interface MovementsOf {
  variantId?: string;
  locationId?: string | null;
  lotId?: string | null;
  orderId?: string;
}

/**
 * Movements filtered as a way in asks, by the keys its address and the
 * API share, ids and never codes, since a code can change (95a). A link
 * to it passes `OFFER_BACK`, so Movements offers Back.
 */
export function movementsPath(of: MovementsOf): string {
  return withQuery('/movements', {
    variantId: of.variantId,
    locationId: of.locationId ?? undefined,
    lotId: of.lotId ?? undefined,
    orderId: of.orderId,
  });
}
