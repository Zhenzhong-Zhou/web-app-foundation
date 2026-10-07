import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { RunStatus } from '../lib/types';

/**
 * Worded as the state of the work rather than the state of the row: "released"
 * means nothing to somebody who has not read ADR-032, and the person reading
 * this screen is the one doing the work. In the reader's language (ADR-054).
 */
const LABELS = defineMessages({
  draft: { id: 'production.status.draft', defaultMessage: 'Planned' },
  released: {
    id: 'production.status.released',
    defaultMessage: 'In progress',
  },
  completed: { id: 'production.status.completed', defaultMessage: 'Finished' },
  cancelled: { id: 'orders.status.cancelled', defaultMessage: 'Cancelled' },
});

/** Every status, in the order work moves through them. */
export const RUN_STATUSES: RunStatus[] = [
  'draft',
  'released',
  'completed',
  'cancelled',
];

export function runStatusLabel(status: RunStatus): string {
  return intl().formatMessage(LABELS[status]);
}
