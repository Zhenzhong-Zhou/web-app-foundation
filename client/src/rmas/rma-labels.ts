import type { ReturnAuthorizationStatus, ReturnResolution } from '../lib/types';

/**
 * How an RMA's status reads on a chip. Open is the one that needs someone —
 * goods to receive, a credit or replacement to raise — so it is the only
 * one in colour.
 */
export function rmaStatus(status: ReturnAuthorizationStatus): {
  label: string;
  color: 'default' | 'primary' | 'success';
} {
  switch (status) {
    case 'open':
      return { label: 'Open', color: 'primary' };
    case 'closed':
      return { label: 'Closed', color: 'default' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'default' };
  }
}

/** What happens to an item, as a person would say it. */
export const RESOLUTION_LABELS: Record<ReturnResolution, string> = {
  credit: 'Credit',
  replace: 'Replace',
  none: 'No credit or replacement',
};
