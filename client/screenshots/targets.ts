import { readFileSync } from 'node:fs';

/** Written by global-setup, read by every picture. Ignored by git. */
export const SESSION_PATH = './screenshots/.state/session.json';
export const TARGETS_PATH = './screenshots/.state/targets.json';

/**
 * The demo records the detail pages open, found by what people call them
 * (SO-DEMO-1, CALM-RUN-01) because their ids change with every seed. Null
 * when this demo does not have one — seeded before the record was added —
 * and the pictures of it are skipped rather than failed.
 */
export interface Targets {
  /** SO-DEMO-1: shipped in part, invoiced, returned, credited, voided. */
  saleOrderId: string | null;
  /** SO-DEMO-1's issued invoice. */
  issuedInvoiceId: string | null;
  /** SO-DEMO-5's invoice, still in draft. */
  draftInvoiceId: string | null;
  /** SO-DEMO-QC's invoice, which prints in French and English. */
  bilingualInvoiceId: string | null;
  /** CALM-RUN-01, released and not yet made. */
  runInProgressId: string | null;
  /** FOC-2609-01, the batch the recall drill traces. */
  batchLotId: string | null;
  /** Calm 90ct, the product with a recipe and a run under way. */
  recipeProductId: string | null;
}

/**
 * Read inside each picture rather than at load: Playwright loads this
 * folder to list the pictures before global-setup has written the file.
 */
export function readTargets(): Targets {
  return JSON.parse(readFileSync(TARGETS_PATH, 'utf8')) as Targets;
}
