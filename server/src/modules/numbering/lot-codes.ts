import { and, eq } from 'drizzle-orm';

import { todayOf } from '../../core/organizations/time-zone';
import type { Transaction } from '../../database/database.module';
import {
  DEFAULT_NUMBERING,
  documentNumbering,
  lots,
} from '../../database/schema';
import { takeNumber } from './document-numbers';

/**
 * Writes the lot series' default for an organization that has none
 * (ADR-094): one registered by the release still serving while the deploy
 * went on, which wrote the five document series alone. Every other
 * organization has its row, from migration 0083 or its registration, and
 * this writes nothing.
 */
export async function openLotSeries(
  tx: Transaction,
  organizationId: string,
): Promise<void> {
  await tx
    .insert(documentNumbering)
    .values({ organizationId, documentType: 'lot', ...DEFAULT_NUMBERING.lot })
    .onConflictDoNothing();
}

/**
 * A code for a lot the organization makes for itself, where a delivery
 * shows none (ADR-094), taken inside the caller's transaction by the
 * organization's today, as a document's number is (ADR-073): the counter's
 * row lock lasts until the caller commits, so two receipts at once never
 * share a code, and a write rolled back gives its number back.
 *
 * One counter for the organization, so a made code names one lot in it. A
 * code the item already has, typed earlier as printed, is passed over for
 * the next: the series is not gapless by promise. A code typed for the same
 * item by a write not yet committed is not seen here, so the caller inserts
 * the lot without merging into one of that code and takes again on a clash.
 */
export async function takeLotCode(
  tx: Transaction,
  organizationId: string,
  variantId: string,
): Promise<string> {
  const day = await todayOf(tx, organizationId);
  await openLotSeries(tx, organizationId);

  for (;;) {
    const code = await takeNumber(tx, organizationId, 'lot', day);
    const [held] = await tx
      .select({ id: lots.id })
      .from(lots)
      .where(
        and(
          eq(lots.organizationId, organizationId),
          eq(lots.variantId, variantId),
          eq(lots.code, code),
        ),
      )
      .limit(1);
    if (!held) return code;
  }
}
