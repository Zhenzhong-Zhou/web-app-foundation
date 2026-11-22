import { defineMessages, type IntlShape } from 'react-intl';

/**
 * Why stock moved, as the server records it (ADR-023), in the order the
 * movements filter offers them. Each reads in the boards' words, Received,
 * Corrected, Used in a run, as the export writes them (ADR-093, 100a),
 * with its capital wherever it stands alone (136a).
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
  receipt: { id: 'inventory.reason.receipt', defaultMessage: 'Received' },
  shipment: { id: 'inventory.reason.shipment', defaultMessage: 'Shipped' },
  transfer: { id: 'inventory.reason.transfer', defaultMessage: 'Moved' },
  adjustment: {
    id: 'inventory.reason.adjustment',
    defaultMessage: 'Corrected',
  },
  production: { id: 'inventory.reason.production', defaultMessage: 'Made' },
  consumption: {
    id: 'inventory.reason.consumption',
    defaultMessage: 'Used in a run',
  },
  sample: { id: 'inventory.reason.sample', defaultMessage: 'Sampled' },
  return: { id: 'inventory.reason.return', defaultMessage: 'Returned' },
});

/**
 * A correction's details by name, and a voided shipment's goods back,
 * the server's `shipment_voided`, which no one chooses (#647).
 */
const DETAILS = defineMessages({
  miscount: { id: 'inventory.detail.miscount', defaultMessage: 'Miscount' },
  damaged: { id: 'inventory.detail.damaged', defaultMessage: 'Damaged' },
  expired: { id: 'inventory.detail.expired', defaultMessage: 'Expired' },
  lost: { id: 'inventory.detail.lost', defaultMessage: 'Lost' },
  found: { id: 'inventory.detail.found', defaultMessage: 'Found' },
  shipment_voided: {
    id: 'inventory.detail.shipmentVoided',
    defaultMessage: 'Shipment voided',
  },
});

/**
 * A reason's name, with its capital, as it stands alone: the Reason
 * filter, its chip and the Why column (136a). One this client does not
 * know is shown as it came.
 */
export function reasonLabel(reason: string, intl: IntlShape): string {
  return reason in REASONS
    ? intl.formatMessage(REASONS[reason as keyof typeof REASONS])
    : reason;
}

/** A correction's detail by name, likewise: Correct the count's Why. */
export function reasonDetailLabel(detail: string, intl: IntlShape): string {
  return detail in DETAILS
    ? intl.formatMessage(DETAILS[detail as keyof typeof DETAILS])
    : detail;
}

/**
 * A reason or a detail inside a sentence, its first letter in lower case,
 * as the glossary writes a detail after its reason, "Corrected: found",
 * and the no-result line names a reason, "No movements match: sampled".
 */
export function inSentence(word: string, intl: IntlShape): string {
  return word.charAt(0).toLocaleLowerCase(intl.locale) + word.slice(1);
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
