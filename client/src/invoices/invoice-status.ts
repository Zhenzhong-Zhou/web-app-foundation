import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { InvoiceStatus } from '../lib/types';

const LABELS = defineMessages({
  draft: { id: 'orders.status.draft', defaultMessage: 'Draft' },
  issued: { id: 'invoices.status.issued', defaultMessage: 'Issued' },
  voided: { id: 'orders.shipments.voided', defaultMessage: 'Voided' },
});

/**
 * How a status reads on a chip, in the reader's language (ADR-054). Issued
 * is the one that matters day to day — it is what the customer owes — so it
 * is the only one in colour.
 */
export function invoiceStatus(status: InvoiceStatus): {
  label: string;
  color: 'default' | 'primary' | 'success';
} {
  return {
    label: intl().formatMessage(LABELS[status]),
    color: status === 'issued' ? 'primary' : 'default',
  };
}
