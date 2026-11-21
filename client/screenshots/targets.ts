import { readFileSync } from 'node:fs';

/** Written by global-setup, read by every picture. Ignored by git. */
export const SESSION_PATH = './screenshots/.state/session.json';
export const TARGETS_PATH = './screenshots/.state/targets.json';
/** An account in no organization, for Home's page for it. */
export const NO_ORGANIZATION_PATH = './screenshots/.state/no-organization.json';

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
  /** CALM-RUN-01, released and not yet made. */
  runInProgressId: string | null;
  /** FOC-2609-01, the batch the recall drill traces. */
  batchLotId: string | null;
  /** Calm 90ct, the product with a recipe and a run under way. */
  recipeProductId: string | null;
  /**
   * VITC-100's variant, the one item Movements is pictured for: its code
   * changed once, and it has receipts, a move and a shipment.
   */
  movementsVariantId: string | null;
  /**
   * The days around that item's movements, as calendar days: a day before
   * the first and a day after the last, so every movement falls inside
   * whether `until` is read as included or excluded.
   */
  movementsRange: { from: string; until: string } | null;
  /** PO-DEMO-4, bought for the second recipe and received in part. */
  partlyReceivedOrderId: string | null;
  /**
   * An invitation to set up a new organization (ADR-078), its link's path
   * by the language it is in, which its page speaks: the page's dashed
   * tile, standing in for the logo.
   */
  organizationInvitationPaths: Record<string, string>;
}

/**
 * Read inside each picture rather than at load: Playwright loads this
 * folder to list the pictures before global-setup has written the file.
 */
export function readTargets(): Targets {
  return JSON.parse(readFileSync(TARGETS_PATH, 'utf8')) as Targets;
}
