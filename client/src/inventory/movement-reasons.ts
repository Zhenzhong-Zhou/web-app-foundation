import { defineMessages, type IntlShape } from 'react-intl';

/**
 * Why stock moved, as the server records it (ADR-023), in the order the
 * movements filter offers them. The English names are the keys themselves,
 * as these always read; other languages name them in their own words
 * (ADR-054).
 */
export const MOVEMENT_REASONS = [
  'receipt',
  'shipment',
  'transfer',
  'adjustment',
  'production',
  'consumption',
  'sample',
  'return',
] as const;

/** What a correction says it was, chosen when the count is corrected. */
export const REASON_DETAILS = [
  'miscount',
  'damaged',
  'expired',
  'lost',
  'found',
] as const;

const REASONS = defineMessages({
  receipt: { id: 'inventory.reason.receipt', defaultMessage: 'receipt' },
  shipment: { id: 'inventory.reason.shipment', defaultMessage: 'shipment' },
  transfer: { id: 'inventory.reason.transfer', defaultMessage: 'transfer' },
  adjustment: {
    id: 'inventory.reason.adjustment',
    defaultMessage: 'adjustment',
  },
  production: {
    id: 'inventory.reason.production',
    defaultMessage: 'production',
  },
  consumption: {
    id: 'inventory.reason.consumption',
    defaultMessage: 'consumption',
  },
  sample: { id: 'inventory.reason.sample', defaultMessage: 'sample' },
  return: { id: 'inventory.reason.return', defaultMessage: 'return' },
});

const DETAILS = defineMessages({
  miscount: { id: 'inventory.detail.miscount', defaultMessage: 'miscount' },
  damaged: { id: 'inventory.detail.damaged', defaultMessage: 'damaged' },
  expired: { id: 'inventory.detail.expired', defaultMessage: 'expired' },
  lost: { id: 'inventory.detail.lost', defaultMessage: 'lost' },
  found: { id: 'inventory.detail.found', defaultMessage: 'found' },
});

/** A reason's name; one this client does not know is shown as it came. */
export function reasonLabel(reason: string, intl: IntlShape): string {
  return reason in REASONS
    ? intl.formatMessage(REASONS[reason as keyof typeof REASONS])
    : reason;
}

/** A correction's detail by name, likewise. */
export function reasonDetailLabel(detail: string, intl: IntlShape): string {
  return detail in DETAILS
    ? intl.formatMessage(DETAILS[detail as keyof typeof DETAILS])
    : detail;
}

/**
 * The columns a list of movements shows, shared by the movements page and
 * a pile's history so the two read the same.
 */
export const MOVEMENT_HEADINGS = defineMessages({
  when: { id: 'inventory.movements.when', defaultMessage: 'When' },
  item: { id: 'inventory.item', defaultMessage: 'Item' },
  change: { id: 'inventory.movements.change', defaultMessage: 'Change' },
  where: { id: 'inventory.movements.where', defaultMessage: 'Where' },
  why: { id: 'inventory.why', defaultMessage: 'Why' },
  by: { id: 'inventory.movements.by', defaultMessage: 'By' },
  /** Who, once the person who made the movement was anonymised (ADR-012). */
  deletedUser: {
    id: 'inventory.movements.deletedUser',
    defaultMessage: 'Deleted user',
  },
});
