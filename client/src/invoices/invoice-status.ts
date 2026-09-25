import type { InvoiceStatus } from '../lib/types';

/**
 * How a status reads on a chip. Issued is the one that matters day to day —
 * it is what the customer owes — so it is the only one in colour.
 */
export function invoiceStatus(status: InvoiceStatus): {
  label: string;
  color: 'default' | 'primary' | 'success';
} {
  switch (status) {
    case 'draft':
      return { label: 'Draft', color: 'default' };
    case 'issued':
      return { label: 'Issued', color: 'primary' };
    case 'voided':
      return { label: 'Voided', color: 'default' };
  }
}
