import type { NumberingReset } from '../../../database/schema';

/**
 * The Numbering section as the API returns it (ADR-068, ADR-073),
 * described for the OpenAPI document by the CLI plugin.
 */

/** Today's next number under each reset, so changing one shows the right one. */
export class NumberingNext {
  never!: number;
  yearly!: number;
  monthly!: number;
  daily!: number;
}

export class NumberingSeries {
  /** As written, date tokens included. */
  prefix!: string;
  digits!: number;
  reset!: NumberingReset;
  next!: NumberingNext;
  /** The last number given in the series, as printed; null before the first. */
  last!: string | null;
}

export class Numbering {
  invoice!: NumberingSeries;
  creditNote!: NumberingSeries;
  returnAuthorization!: NumberingSeries;
  saleOrder!: NumberingSeries;
  purchaseOrder!: NumberingSeries;
  documentsInDateOrder!: boolean;
  /** The organization's today (ADR-072), which a preview prints. */
  today!: string;
}

export class NumberingEnvelope {
  numbering!: Numbering;
}
