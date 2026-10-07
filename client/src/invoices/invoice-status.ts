import type { ChipProps } from '@mui/material';
import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { InvoiceStatus } from '../lib/types';
import { COLOR_OF_TONE, STATUS_TONES } from '../theme/status';

const LABELS = defineMessages({
  draft: { id: 'orders.status.draft', defaultMessage: 'Draft' },
  issued: { id: 'invoices.status.issued', defaultMessage: 'Issued' },
  voided: { id: 'orders.shipments.voided', defaultMessage: 'Voided' },
});

/**
 * How a status reads on a chip, in the reader's language (ADR-054), in its
 * tone from the one table (ADR-055): Draft neutral, Issued quiet blue,
 * Voided red.
 */
export function invoiceStatus(status: InvoiceStatus): {
  label: string;
  color: ChipProps['color'];
} {
  return {
    label: intl().formatMessage(LABELS[status]),
    color: COLOR_OF_TONE[STATUS_TONES.invoice[status]],
  };
}
