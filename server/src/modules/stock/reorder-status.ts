import { type SQL, sql } from 'drizzle-orm';

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
export function statusOf(f: PositionFigures): SQL {
  return sql`case
    when not ${f.active} then 'discontinued'
    when ${f.position} <= 0 then 'out'
    when ${f.position} < ${f.reorderPoint} then 'low'
    else 'enough'
  end`;
}
