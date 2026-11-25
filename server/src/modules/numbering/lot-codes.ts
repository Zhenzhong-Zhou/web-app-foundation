import { ConflictException } from '@nestjs/common';
import { and, desc, eq, ne } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { dayIn } from '../../common/today';
import { timeZoneOf, todayOf } from '../../core/organizations/time-zone';
import type { Transaction } from '../../database/database.module';
import {
  DEFAULT_NUMBERING,
  documentNumbering,
  lotFormerCodes,
  lots,
} from '../../database/schema';
import { calendarDay, t } from '../../i18n/translate';
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
    // The series' own key, so no other conflict is ever swallowed.
    .onConflictDoNothing({
      target: [
        documentNumbering.organizationId,
        documentNumbering.documentType,
      ],
    });
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
 * the next, and so is one a lot of the item had before its code was
 * corrected (ADR-094 amended, R11): the series is not gapless by promise.
 * A code typed for the same item by a write not yet committed is not seen
 * here, so the caller inserts the lot without merging into one of that
 * code and takes again on a clash.
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
    if (!held && !(await lotThatHad(tx, organizationId, variantId, code)))
      return code;
  }
}

/**
 * The lot of the item that had `code` before Edit lot details corrected
 * it, and has another code now (ADR-094 amended, R8, R11), with when it
 * stopped being that lot's; none where no lot of the item left it. A lot
 * whose code it is again, taken back, is found by its code instead, and
 * `except` leaves out the lot being renamed, which may take its own back.
 */
async function lotThatHad(
  tx: Transaction,
  organizationId: string,
  variantId: string,
  code: string,
  except?: string,
): Promise<{ id: string; code: string; until: Date } | undefined> {
  const [lot] = await tx
    .select({ id: lots.id, code: lots.code, until: lotFormerCodes.changedAt })
    .from(lotFormerCodes)
    .innerJoin(
      lots,
      and(
        eq(lots.id, lotFormerCodes.lotId),
        eq(lots.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(lotFormerCodes.organizationId, organizationId),
        eq(lotFormerCodes.code, code),
        eq(lots.variantId, variantId),
        ne(lots.code, code),
        ...(except ? [ne(lots.id, except)] : []),
      ),
    )
    .orderBy(desc(lotFormerCodes.changedAt))
    .limit(1);
  return lot;
}

/**
 * Refuses `code` for a new lot of the item, or for another of its lots,
 * where one of its lots had it before its code was corrected (ADR-094
 * amended, R11): a box still labelled with the old code would start a
 * second lot of one run, and a recall would miss half of it. Names that
 * lot and until when, the day the organization's, and carries it for
 * the receive dialogs' Use {code}. Another item may carry the code, as
 * a code is unique within an item (ADR-023).
 */
export async function refuseFormerCode(
  tx: Transaction,
  organizationId: string,
  variantId: string,
  code: string,
  except?: string,
): Promise<void> {
  const had = await lotThatHad(tx, organizationId, variantId, code, except);
  if (!had) return;

  const day = dayIn(await timeZoneOf(tx, organizationId), had.until);
  throw new ConflictException(
    withCode(
      t(
        {
          id: 'stock.lotCodeFormer',
          defaultMessage:
            '{code} was the code of lot {lot} until {day}. A code is never given to a second lot.',
        },
        { code, lot: had.code, day: calendarDay(day) },
      ),
      ERROR_CODES.lotCodeFormer,
      { lotId: had.id, lotCode: had.code },
    ),
  );
}
