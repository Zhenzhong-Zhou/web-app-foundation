import { defineMessages, type IntlShape } from 'react-intl';

/**
 * Why stock moved, as the server records it (ADR-023), in the order the
 * movements filter offers them. Each reads in the boards' words, received,
 * corrected, used in a run, as the export writes them (ADR-093, 100a);
 * the cell and the filter capitalize the first letter.
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
  receipt: { id: 'inventory.reason.receipt', defaultMessage: 'received' },
  shipment: { id: 'inventory.reason.shipment', defaultMessage: 'shipped' },
  transfer: { id: 'inventory.reason.transfer', defaultMessage: 'moved' },
  adjustment: {
    id: 'inventory.reason.adjustment',
    defaultMessage: 'corrected',
  },
  production: { id: 'inventory.reason.production', defaultMessage: 'made' },
  consumption: {
    id: 'inventory.reason.consumption',
    defaultMessage: 'used in a run',
  },
  sample: { id: 'inventory.reason.sample', defaultMessage: 'sampled' },
  return: { id: 'inventory.reason.return', defaultMessage: 'returned' },
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
 * a pile's history so the two read the same; In, Out and Balance a stock
 * card's (ADR-093, the glossary's).
 */
export const MOVEMENT_HEADINGS = defineMessages({
  when: { id: 'inventory.movements.when', defaultMessage: 'When' },
  item: { id: 'inventory.item', defaultMessage: 'Item' },
  change: { id: 'inventory.movements.change', defaultMessage: 'Change' },
  in: { id: 'inventory.movements.in', defaultMessage: 'In' },
  out: { id: 'inventory.movements.out', defaultMessage: 'Out' },
  balance: { id: 'inventory.movements.balance', defaultMessage: 'Balance' },
  reason: { id: 'inventory.movements.reason', defaultMessage: 'Reason' },
  fromTo: { id: 'inventory.movements.fromTo', defaultMessage: 'From → to' },
  lot: { id: 'inventory.lot', defaultMessage: 'Lot' },
  for: { id: 'inventory.movements.for', defaultMessage: 'For' },
  where: { id: 'inventory.movements.where', defaultMessage: 'Where' },
  by: { id: 'inventory.movements.by', defaultMessage: 'By' },
  /** Who, once the person who made the movement was anonymised (ADR-012). */
  deletedUser: {
    id: 'inventory.movements.deletedUser',
    defaultMessage: 'Deleted user',
  },
});
