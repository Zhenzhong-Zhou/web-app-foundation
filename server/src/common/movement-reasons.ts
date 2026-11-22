import type { MovementReason } from '../database/schema';
import { t, type Translatable } from '../i18n/translate';

/**
 * Why stock moved, in the words Movements' Reason column and its filter
 * use, the boards' (ADR-093, 100a), each with its capital as it stands
 * alone (136a): Movements' export and the Activity log read this one
 * list, so the two never name a reason differently (#649's 43). A value
 * no longer listed reads as it was stored.
 */
export const MOVEMENT_REASON_WORDS: Record<MovementReason, Translatable> = {
  receipt: t({ id: 'stock.reason.receipt', defaultMessage: 'Received' }),
  shipment: t({ id: 'stock.reason.shipment', defaultMessage: 'Shipped' }),
  transfer: t({ id: 'stock.reason.transfer', defaultMessage: 'Moved' }),
  adjustment: t({
    id: 'stock.reason.adjustment',
    defaultMessage: 'Corrected',
  }),
  production: t({ id: 'stock.reason.production', defaultMessage: 'Made' }),
  consumption: t({
    id: 'stock.reason.consumption',
    defaultMessage: 'Used in a run',
  }),
  sample: t({ id: 'stock.reason.sample', defaultMessage: 'Sampled' }),
  return: t({ id: 'stock.reason.return', defaultMessage: 'Returned' }),
  lot_change: t({
    id: 'stock.reason.lotChange',
    defaultMessage: 'Lot changed',
  }),
};
