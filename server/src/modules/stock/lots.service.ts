import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { recordUnchanged } from '../../core/audit/audit-context';
import { isUniqueViolation } from '../../database/errors';
import { lots } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { ListLotsDto } from './dto/list-lots.dto';
import type { Lot } from './dto/stock-response.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
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
    const rows = await this.tenantDb.select(
      lots,
      eq(lots.variantId, query.variantId),
      { orderBy: desc(lots.createdAt) },
    );
    return rows.map(lotOf);
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
   */
  async updateLot(
    lotId: string,
    input: UpdateLotDto,
  ): Promise<{ marked: boolean }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
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

      if (input.code && input.code !== lot.code && !madeHere) {
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

      // Empty, or null as an API caller may send it, takes it away.
      const supplierLot =
        input.supplierLot === undefined
          ? undefined
          : input.supplierLot?.trim() || null;

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
        ...(input.code !== undefined && input.code !== lot.code
          ? { code: input.code }
          : {}),
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
                defaultMessage: '{code} already exists for this item',
              },
              { code: input.code },
            ),
          );
        }
        throw error;
      }

      this.logger.log(
        `Lot ${lotId} updated${marked ? ', marked made here' : ''}`,
      );
      return { marked };
    });
  }
}

/**
 * A lot as the API returns it (ADR-068): what the receive dialogs show, not
 * the row, which would also send the organization and when it arrived.
 */
function lotOf({ id, code, expiresAt, isAssigned }: Lot): Lot {
  return { id, code, expiresAt, isAssigned };
}
