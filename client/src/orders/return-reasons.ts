import { defineMessages, type IntlShape } from 'react-intl';

/**
 * Why things usually come back, as a return records them. "Other" leaves
 * the note to explain. Stored as these words, so a return reads the same
 * in every language's list; each language names them in its own words
 * (ADR-054), and the English names are the words themselves.
 */
export const RETURN_REASONS = [
  'damaged',
  'wrong item',
  'not wanted',
  'expired',
  'quality concern',
  'other',
] as const;

const LABELS = defineMessages({
  damaged: { id: 'orders.returnReason.damaged', defaultMessage: 'damaged' },
  'wrong item': {
    id: 'orders.returnReason.wrongItem',
    defaultMessage: 'wrong item',
  },
  'not wanted': {
    id: 'orders.returnReason.notWanted',
    defaultMessage: 'not wanted',
  },
  expired: { id: 'orders.returnReason.expired', defaultMessage: 'expired' },
  'quality concern': {
    id: 'orders.returnReason.qualityConcern',
    defaultMessage: 'quality concern',
  },
  other: { id: 'orders.returnReason.other', defaultMessage: 'other' },
});

/** A reason by name; one this client does not know is shown as it came. */
export function returnReasonLabel(reason: string, intl: IntlShape): string {
  return reason in LABELS
    ? intl.formatMessage(LABELS[reason as keyof typeof LABELS])
    : reason;
}
