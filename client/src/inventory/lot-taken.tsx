import { useIntl } from 'react-intl';

import type { ShipmentPlanLot } from '../api/types.gen';
import { Reference } from '../components/reference';
import { formatQuantity } from '../lib/format';
import { lotExpiryPart } from './lot-expiry';

/**
 * One lot a plan takes and how much, as Ship and Release list the lots
 * they will take: "L-0412 (expires Oct 1, 2026): 40", one whose expiry
 * is not known yet "(expiry to add)", one that does not expire its code
 * alone (ADR-094, D2).
 */
export function LotTaken({
  lot,
}: {
  lot: Pick<ShipmentPlanLot, 'code' | 'expiresAt' | 'expiry' | 'take'>;
}) {
  const intl = useIntl();
  const expiry = lotExpiryPart(lot, intl);
  const code = <Reference>{lot.code}</Reference>;
  const quantity = formatQuantity(lot.take);

  return expiry
    ? intl.formatMessage(
        {
          id: 'orders.ship.lotTakeWith',
          defaultMessage: '{code} ({expiry}): {quantity}',
        },
        { code, expiry, quantity },
      )
    : intl.formatMessage(
        { id: 'orders.ship.lotTake', defaultMessage: '{code}: {quantity}' },
        { code, quantity },
      );
}
