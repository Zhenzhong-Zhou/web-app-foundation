import { Link } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import type {
  LicenceAtReleaseFields,
  LicenceStatusAtRelease,
} from '../lib/types';

/**
 * What a batch was made under, as the run page and the lot trace both say
 * it (ADR-050): "80012345 (Health Canada), expired at release, released by
 * Bob: renewal filed 3 Sept".
 *
 * The number and authority are the ones copied at release, so correcting
 * the licence later does not change this. The number links to the licence
 * register for whoever can read it; there is no page per licence.
 *
 * Only for a run that has been released: before that nothing is copied, and
 * the caller shows a dash. A run released before the state was recorded
 * says so, rather than passing for current.
 */
export function LicenceAtRelease({
  run,
  linkToLicences,
}: {
  run: LicenceAtReleaseFields;
  linkToLicences: boolean;
}) {
  if (!run.licenceNumber) {
    return <>{run.licenceStatusAtRelease === 'none' ? 'No licence' : '—'}</>;
  }

  const name = `${run.licenceNumber} (${run.licenceAuthority ?? ''})`;

  return (
    <>
      {linkToLicences ? (
        <Link component={RouterLink} to="/licences">
          {name}
        </Link>
      ) : (
        name
      )}
      {`, ${statusPhrase(run.licenceStatusAtRelease)}`}
      {run.licenceOverrideReason &&
        `, released by ${run.licenceOverriddenByName ?? 'a former member'}: ${run.licenceOverrideReason}`}
    </>
  );
}

function statusPhrase(status: LicenceStatusAtRelease | null): string {
  switch (status) {
    case 'current':
      return 'current at release';
    case 'expired':
      return 'expired at release';
    case 'not_in_force':
      return 'not yet in force at release';
    case 'none':
      return 'no licence at release';
    case null:
      return 'state at release not recorded';
  }
}
