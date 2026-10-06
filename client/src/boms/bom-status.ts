import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { Bom } from '../lib/types';

/**
 * A recipe version's status by name, in the reader's language (ADR-054).
 * The English names are the stored words, as they always read.
 */
const LABELS = defineMessages({
  draft: { id: 'boms.status.draft', defaultMessage: 'draft' },
  active: { id: 'boms.status.active', defaultMessage: 'active' },
  archived: { id: 'boms.status.archived', defaultMessage: 'archived' },
});

export function bomStatusLabel(status: Bom['status']): string {
  return intl().formatMessage(LABELS[status]);
}
