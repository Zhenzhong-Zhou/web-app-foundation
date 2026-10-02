import { Chip } from '@mui/material';

import type { ProductLicence } from '../lib/types';
import { licenceStatus } from './licence-status';

/**
 * A licence's state as a chip: Current, Expires in N days, Expired, In force
 * from, Withdrawn — derived from its dates, never stored (ADR-040). Filled
 * while it can still be put on a new recipe, outlined once it cannot.
 *
 * The recipe panel shows it beside the licence a recipe is made under, so a
 * lapse is seen before a run is planned rather than at release (ADR-050).
 */
export function LicenceStatusChip({ licence }: { licence: ProductLicence }) {
  const status = licenceStatus(licence);

  return (
    <Chip
      size="small"
      label={status.label}
      color={status.tone}
      variant={status.usable ? 'filled' : 'outlined'}
    />
  );
}
