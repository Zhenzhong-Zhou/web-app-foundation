import type { IntlShape } from 'react-intl';

/**
 * A lot's supplier's lot in words (ADR-094, R5): "Supplier's lot
 * SUP-88", or for a code made here with none yet "Supplier's lot to add";
 * null for a code the supplier printed, which is its own. Under a code
 * (SupplierLotLine), and as a part of a line on a lot's page and in the
 * lookup.
 */
export function supplierLotPart(
  lot: { isAssigned: boolean | null; supplierLot: string | null },
  intl: IntlShape,
): string | null {
  if (lot.supplierLot) {
    return intl.formatMessage(
      {
        id: 'inventory.lot.supplierLotIs',
        defaultMessage: 'Supplier’s lot {code}',
      },
      { code: lot.supplierLot },
    );
  }
  return lot.isAssigned
    ? intl.formatMessage({
        id: 'inventory.lot.supplierLotToAdd',
        defaultMessage: 'Supplier’s lot to add',
      })
    : null;
}
