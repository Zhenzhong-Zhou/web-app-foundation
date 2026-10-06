import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { ReturnAuthorizationStatus, ReturnResolution } from '../lib/types';

const STATUS = defineMessages({
  open: { id: 'orders.filter.open', defaultMessage: 'Open' },
  closed: { id: 'rmas.status.closed', defaultMessage: 'Closed' },
  cancelled: { id: 'orders.status.cancelled', defaultMessage: 'Cancelled' },
});

const RESOLUTION = defineMessages({
  credit: { id: 'rmas.resolution.credit', defaultMessage: 'Credit' },
  replace: { id: 'rmas.resolution.replace', defaultMessage: 'Replace' },
  none: {
    id: 'rmas.resolution.none',
    defaultMessage: 'No credit or replacement',
  },
});

/** Every resolution, in the order a select offers them. */
export const RESOLUTIONS: ReturnResolution[] = ['credit', 'replace', 'none'];

/**
 * How an RMA's status reads on a chip, in the reader's language (ADR-054).
 * Open is the one that needs someone — goods to receive, a credit or
 * replacement to raise — so it is the only one in colour.
 */
export function rmaStatus(status: ReturnAuthorizationStatus): {
  label: string;
  color: 'default' | 'primary' | 'success';
} {
  return {
    label: intl().formatMessage(STATUS[status]),
    color: status === 'open' ? 'primary' : 'default',
  };
}

/** What happens to an item, as a person would say it. */
export function resolutionLabel(resolution: ReturnResolution): string {
  return intl().formatMessage(RESOLUTION[resolution]);
}
