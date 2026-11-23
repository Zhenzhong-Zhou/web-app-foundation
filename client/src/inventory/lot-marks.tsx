import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

/**
 * A lot's supplier's lot under its code (ADR-094, R5): "Supplier's lot
 * SUP-88", which finds it too (R6), or for a code made here with none yet
 * "Supplier's lot to add", the mark Details to add lists until it is
 * given. A code printed by the supplier is its own, and says nothing.
 * Its expiry's own mark, "Expiry to add", is where the expiry shows
 * (ExpiryChip).
 */
export function SupplierLotLine({
  isAssigned,
  supplierLot,
}: {
  isAssigned: boolean | null;
  supplierLot: string | null;
}) {
  const intl = useIntl();
  if (!supplierLot && !isAssigned) return null;

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {supplierLot
        ? intl.formatMessage(
            {
              id: 'inventory.lot.supplierLotIs',
              defaultMessage: 'Supplier’s lot {code}',
            },
            { code: supplierLot },
          )
        : intl.formatMessage({
            id: 'inventory.lot.supplierLotToAdd',
            defaultMessage: 'Supplier’s lot to add',
          })}
    </Typography>
  );
}
