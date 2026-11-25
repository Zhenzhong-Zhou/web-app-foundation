import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  type FieldValues,
  recordContext,
  recordUnchanged,
} from '../../core/audit/audit-context';
import type { AuditField } from '../../core/audit/audit-fields';
import { isUniqueViolation } from '../../database/errors';
import { lotFormerCodes, lots, productVariants } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { refuseFormerCode } from '../numbering/lot-codes';
import { ListLotsDto } from './dto/list-lots.dto';
import type { Lot } from './dto/stock-response.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { formerCodesOf } from './former-codes';
import { expiryOf } from './stock.service';

/**
 * Lots as records: the codes already known for a variant, and correcting
 * one's details: its code, its supplier's lot, its expiry, and the mark
 * that its code was made here.
 *
 * Its own service because neither moves stock. A lot comes into being with
 * the movement that brings it in, and that stays in StockService.
 */
@Injectable()
export class LotsService {
  private readonly logger = new Logger(LotsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * The lot codes already known for one variant.
   *
   * Exists for the receive dialogs. A free-text lot field turns a typo into a
   * second lot row for one physical run — a recall for L2024-A then returns
   * the wrong units, and nothing about the split looks wrong on screen.
   * Showing what already exists is what makes the typo visible.
   *
   * Expiry comes along because it is how someone spots the other mistake:
   * typing a code that exists but belongs to a different run.
   */
  async listLots(query: ListLotsDto): Promise<Lot[]> {
    return this.tenantDb.transaction((tx, organizationId) =>
      tx
        .select({
          id: lots.id,
          code: lots.code,
          expiresAt: lots.expiresAt,
          expiry: lots.expiry,
          isAssigned: lots.isAssigned,
          supplierLot: lots.supplierLot,
          // Each lot's former codes, so the field refuses another lot's
          // as it is typed (ADR-094 amended, R11, F2).
          formerCodes: formerCodesOf(
            { id: sql`lots.id`, code: sql`lots.code` },
            organizationId,
          ),
        })
        .from(lots)
        .where(
          and(
            eq(lots.organizationId, organizationId),
            eq(lots.variantId, query.variantId),
          ),
        )
        .orderBy(desc(lots.createdAt)),
    );
  }

  /**
   * Edit lot details (ADR-094): a lot's expiry, one of three, on any lot;
   * its supplier's lot and its code where the code was ours to invent; and
   * an older code typed up here marked so, one way. What it did, for the
   * controller to log the mark as its own entry.
   *
   * `isAssigned` is the discriminator. A supplier-printed code is authoritative
   * — renaming the row makes the record disagree with the boxes, and the
   * honest correction is adjustment movements between two lots. A code this
   * organization invented has no external truth behind it, so a typo is a
   * typo. Marked in the same save, the code is treated as invented already.
   *
   * The row is read for update, so two saves at once mark it once.
   *
   * A corrected code is kept as one of the lot's former codes, with who
   * corrected it and why, in the same save (ADR-094 amended, R8), and
   * another lot's former code is refused (R11). A save that names a code
   * takes the variant's row first, `for no key update`, so a write of a
   * new lot of the item, which reads it `for share`, never reads the
   * item's former codes while one is being written.
   */
  async updateLot(
    lotId: string,
    input: UpdateLotDto,
    actorId: string,
  ): Promise<{ marked: boolean }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      if (input.code !== undefined) {
        await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.organizationId, organizationId),
              inArray(
                productVariants.id,
                tx
                  .select({ variantId: lots.variantId })
                  .from(lots)
                  .where(
                    and(
                      eq(lots.id, lotId),
                      eq(lots.organizationId, organizationId),
                    ),
                  ),
              ),
            ),
          )
          .for('no key update');
      }

      const [lot] = await tx
        .select()
        .from(lots)
        .where(and(eq(lots.id, lotId), eq(lots.organizationId, organizationId)))
        .for('update');

      if (!lot)
        throw new NotFoundException(
          t({ id: 'stock.suchLot', defaultMessage: 'No such lot' }),
        );

      // One way: true marks, and nothing unmarks (R7).
      const marked = input.madeHere === true && !lot.isAssigned;
      const madeHere = lot.isAssigned || marked;

      // The code it is given, where it changes.
      const recoded =
        input.code !== undefined && input.code !== lot.code ? input.code : null;

      if (recoded !== null && !madeHere) {
        throw new ConflictException(
          t(
            {
              id: 'stock.codeCameSupplierSo',
              defaultMessage:
                '{code} came from the supplier, so it cannot be renamed. Move the stock to the correct lot instead.',
            },
            { code: lot.code },
          ),
        );
      }

      // Why, asked only when the code changes (E2a), kept with the code it
      // leaves; the DTO has trimmed it.
      if (recoded !== null && !input.reason) {
        throw new BadRequestException(
          t({
            id: 'stock.lotCodeWhy',
            defaultMessage: 'Say why the code is changing.',
          }),
        );
      }
      if (recoded !== null) {
        await refuseFormerCode(
          tx,
          organizationId,
          lot.variantId,
          recoded,
          lot.id,
        );
      }

      // Empty, or null as an API caller may send it, takes it away; the
      // DTO has trimmed it.
      const supplierLot =
        input.supplierLot === undefined ? undefined : input.supplierLot || null;

      // A code typed from the box is the supplier's own, so it has no
      // supplier's lot to add (R5).
      if (supplierLot && !madeHere) {
        throw new BadRequestException(
          t(
            {
              id: 'stock.supplierLotForTypedLot',
              defaultMessage:
                '{code} was typed from the box, so it is the supplier’s own lot. Leave the supplier’s lot empty, or say we made this code up.',
            },
            { code: lot.code },
          ),
        );
      }

      // The three, by the rule a new lot's are read (R8); with neither
      // field, the expiry stays as it is.
      const expiry =
        input.expiry == null && input.expiresAt === undefined
          ? undefined
          : expiryOf(input);

      const changes: Partial<typeof lots.$inferInsert> = {
        ...(recoded !== null ? { code: recoded } : {}),
        ...(supplierLot !== undefined && supplierLot !== lot.supplierLot
          ? { supplierLot }
          : {}),
        ...(expiry &&
        (expiry.expiry !== lot.expiry || expiry.expiresAt !== lot.expiresAt)
          ? expiry
          : {}),
      };

      // The mark is logged as its own entry; Lot updated, the route's,
      // only where something else changed, so a save that changed
      // nothing, or only marked the code, writes no entry of its own.
      const changed = Object.keys(changes).length > 0;
      if (!changed) recordUnchanged();
      if (!changed && !marked) return { marked };

      if (changed) {
        // Lot updated names the lot and its item, as a lot change does, and
        // keeps each field the save changed, from and to: a corrected code
        // is kept nowhere else (#687). Codes and a day, never the note.
        const [variant] = await tx
          .select({ sku: productVariants.sku })
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, lot.variantId),
              eq(productVariants.organizationId, organizationId),
            ),
          );
        recordContext({
          sku: variant?.sku,
          lotId: { id: lot.id, label: changes.code ?? lot.code },
          ...fromTo('lotCode', lot.code, changes.code),
          ...fromTo('supplierLot', lot.supplierLot, changes.supplierLot),
          ...fromTo('expiry', lot.expiry, changes.expiry),
          ...fromTo('expiresAt', lot.expiresAt, changes.expiresAt),
        });
      }

      try {
        await tx
          .update(lots)
          .set({ ...changes, ...(marked ? { isAssigned: true } : {}) })
          .where(
            and(eq(lots.id, lotId), eq(lots.organizationId, organizationId)),
          );
      } catch (error) {
        // The unique index on (organization_id, variant_id, code). Merging
        // two lots is a different operation with its own rules, not a
        // rename.
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            t(
              {
                id: 'stock.codeExistsItem',
                defaultMessage:
                  '{code} already exists for this item. Type another code.',
              },
              { code: input.code },
            ),
          );
        }
        throw error;
      }

      // The code it leaves, read by every lot search and refused for any
      // other lot of the item; the reason is free text, so it is kept
      // here and never in the Activity log (ADR-018).
      if (recoded !== null) {
        await tx.insert(lotFormerCodes).values({
          organizationId,
          lotId: lot.id,
          code: lot.code,
          changedBy: actorId,
          reason: input.reason!,
        });
      }

      this.logger.log(
        `Lot ${lotId} updated${marked ? ', marked made here' : ''}`,
      );
      return { marked };
    });
  }
}

/**
 * A field Edit lot details changed, `{ from, to }` under its audit key, or
 * nothing where it stayed as it was.
 */
function fromTo(key: AuditField, from: unknown, to: unknown): FieldValues {
  return to === undefined || to === from ? {} : { [key]: { from, to } };
}
