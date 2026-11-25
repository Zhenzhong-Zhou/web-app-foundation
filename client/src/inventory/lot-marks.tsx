import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import { supplierLotPart } from './supplier-lot-part';
import { wasCode } from './was-code';

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
  const part = supplierLotPart({ isAssigned, supplierLot }, intl);
  if (!part) return null;

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {part}
    </Typography>
  );
}

/**
 * A lot's latest former code, one grey line under its code: "was
 * ASH-06O1", as a changed item code reads on Movements (ADR-094 amended,
 * R9). A lot never corrected says nothing, never an empty "was —".
 */
export function FormerCodeLine({ code }: { code: string | null }) {
  const intl = useIntl();
  if (!code) return null;

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {wasCode(code, intl)}
    </Typography>
  );
}
