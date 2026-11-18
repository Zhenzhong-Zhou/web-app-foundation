import { type SQL, sql } from 'drizzle-orm';

import { t, type Translatable } from '../../i18n/translate';

/**
 * Where an item with a reorder point stands (ADR-085): out at zero or
 * less, nothing usable and nothing coming; low below its point; enough
 * otherwise. A discontinued item, or one of a discontinued product,
 * keeps its point and is never low.
 */
export const REORDER_STATUSES = [
  'out',
  'low',
  'enough',
  'discontinued',
] as const;

export type ReorderStatus = (typeof REORDER_STATUSES)[number];

/**
 * Each status as the screens say it, Home's words (ADR-091): an export's
 * Status column (#473's 29).
 */
export const REORDER_STATUS_WORDS: Record<ReorderStatus, Translatable> = {
  out: t({ id: 'stock.status.out', defaultMessage: 'Out' }),
  low: t({ id: 'stock.status.low', defaultMessage: 'Low' }),
  enough: t({ id: 'stock.status.enough', defaultMessage: 'Enough' }),
  discontinued: t({
    id: 'stock.status.discontinued',
    defaultMessage: 'Discontinued',
  }),
};

/** A point's figures, as SQL, for the status and the suggestion. */
export interface PositionFigures {
  position: SQL;
  reorderPoint: SQL;
  rule: SQL;
  fixedQuantity: SQL;
  maximumQuantity: SQL;
  inDraft: SQL;
  /** Neither the variant nor its product discontinued. */
  active: SQL;
}

/**
 * Out, low, enough or discontinued, as REORDER_STATUSES names them: the
 * one rule for a code's status, which a code's figures (code-figures.ts)
 * and Reorder's position (reorder-position.ts) both read.
 */
export function statusOf(
  f: Pick<PositionFigures, 'position' | 'reorderPoint' | 'active'>,
): SQL {
  return sql`case
    when not ${f.active} then 'discontinued'
    when ${f.position} <= 0 then 'out'
    when ${f.position} < ${f.reorderPoint} then 'low'
    else 'enough'
  end`;
}
