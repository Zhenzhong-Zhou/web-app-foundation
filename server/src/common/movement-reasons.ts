import type { MovementReason } from '../database/schema';
import { t, type Translatable } from '../i18n/translate';

/**
 * Why stock was received with no order (ADR-094, R11), the receipt's
 * detail: a key the screens translate, `other` with a note or without.
 * Movements reads "Received: opening stock".
 */
export const RECEIPT_DETAILS = [
  'opening',
  'returned',
  'sample',
  'other',
] as const;

export type ReceiptDetail = (typeof RECEIPT_DETAILS)[number];

/**
 * Which lot change a movement is (ADR-094, 4a), its detail: the code's
 * stock on hand put into its first lot as its lot tracking starts, part
 * of a lot moved into another of the item's lots, or stock come back as
 * it left before the code's lot tracking started, a return or a voided
 * shipment's goods, put into that first lot (Q3a).
 */
export type LotChangeDetail = 'lots_started' | 'between_lots' | 'from_before';

/**
 * Each lot change read as the action that made it, the name its menu, its
 * dialog or the Activity log gives it, in place of "Lot changed: …"
 * (ADR-094, U1): Movements' export and a move's entry in the Activity log
 * read this one list, as the screen does its own.
 */
export const LOT_CHANGE_WORDS: Record<LotChangeDetail, Translatable> = {
  lots_started: t({
    id: 'stock.lotChange.lotsStarted',
    defaultMessage: 'Lot tracking started',
  }),
  between_lots: t({
    id: 'stock.lotChange.betweenLots',
    defaultMessage: 'Moved to another lot',
  }),
  from_before: t({
    id: 'stock.lotChange.fromBefore',
    defaultMessage: 'Back from before lot tracking',
  }),
};

/**
 * A voided shipment's goods back, an adjustment's detail (ADR-041): a key
 * the screens translate, as a correction's are (#647).
 */
export const SHIPMENT_VOIDED = 'shipment_voided';

/**
 * A detail as stored, read as the key it means: until November 2026 a
 * voided shipment's goods back were stored as the English text "shipment
 * voided" (#647), so every reader sends that row as the key.
 */
export function detailOf(stored: string | null): string | null {
  return stored === 'shipment voided' ? SHIPMENT_VOIDED : stored;
}

/**
 * Why stock moved, in the words Movements' Reason column and its filter
 * use, the boards' (ADR-093, 100a), each with its capital as it stands
 * alone (136a): Movements' export and the Activity log read this one
 * list, so the two never name a reason differently (#649's 43). A value
 * no longer listed reads as it was stored. A lot change's is the three
 * kinds as one, the filter's name; a row reads its own action
 * (`LOT_CHANGE_WORDS`).
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
    id: 'stock.reason.lotChanges',
    defaultMessage: 'Lot changes',
  }),
};
