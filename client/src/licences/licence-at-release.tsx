import { Link } from '@mui/material';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { nameAndCode, NO_VALUE } from '../lib/format';
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
  const intl = useIntl();

  if (!run.licenceNumber) {
    return (
      <>
        {run.licenceStatusAtRelease === 'none'
          ? intl.formatMessage({
              id: 'licences.atRelease.noLicence',
              defaultMessage: 'No licence',
            })
          : NO_VALUE}
      </>
    );
  }

  // Data, the same in every language: "80012345 (Health Canada)".
  const name = nameAndCode(run.licenceNumber, run.licenceAuthority ?? '');
  const licence = linkToLicences ? (
    <Link component={RouterLink} to="/licences">
      {name}
    </Link>
  ) : (
    name
  );
  const status = intl.formatMessage(
    PHRASES[run.licenceStatusAtRelease ?? 'unrecorded'],
  );

  // One sentence each way, so a language orders the parts as it needs.
  return run.licenceOverrideReason ? (
    <FormattedMessage
      id="licences.atRelease.overridden"
      defaultMessage="{licence}, {status}, released by {who}: {reason}"
      values={{
        licence,
        status,
        who:
          run.licenceOverriddenByName ??
          intl.formatMessage({
            id: 'licences.atRelease.formerMember',
            defaultMessage: 'a former member',
          }),
        reason: run.licenceOverrideReason,
      }}
    />
  ) : (
    <FormattedMessage
      id="licences.atRelease.line"
      defaultMessage="{licence}, {status}"
      values={{ licence, status }}
    />
  );
}

const PHRASES = defineMessages({
  current: {
    id: 'licences.atRelease.current',
    defaultMessage: 'current at release',
  },
  expired: {
    id: 'licences.atRelease.expired',
    defaultMessage: 'expired at release',
  },
  not_in_force: {
    id: 'licences.atRelease.notInForce',
    defaultMessage: 'not yet in force at release',
  },
  none: {
    id: 'licences.atRelease.none',
    defaultMessage: 'no licence at release',
  },
  unrecorded: {
    id: 'licences.atRelease.unrecorded',
    defaultMessage: 'state at release not recorded',
  },
} satisfies Record<
  LicenceStatusAtRelease | 'unrecorded',
  { id: string; defaultMessage: string }
>);
