import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { isUniqueViolation } from '../../database/errors';
import { lots } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { ListLotsDto } from './dto/list-lots.dto';
import { UpdateLotDto } from './dto/update-lot.dto';

/**
 * Lots as records: the codes already known for a variant, and correcting
 * one's code or expiry.
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
  listLots(query: ListLotsDto) {
    return this.tenantDb.select(lots, eq(lots.variantId, query.variantId), {
      orderBy: desc(lots.createdAt),
    });
  }

  /**
   * Corrects a lot's expiry, and its code when the code was ours to invent.
   *
   * `isAssigned` is the discriminator. A supplier-printed code is authoritative
   * — renaming the row makes the record disagree with the boxes, and the
   * honest correction is adjustment movements between two lots. A code this
   * organization invented has no external truth behind it, so a typo is a
   * typo.
   */
  async updateLot(lotId: string, input: UpdateLotDto) {
    const [lot] = await this.tenantDb.select(lots, eq(lots.id, lotId));

    if (!lot) throw new NotFoundException('No such lot');

    if (input.code && input.code !== lot.code && !lot.isAssigned) {
      throw new ConflictException(
        `${lot.code} came from the supplier, so it cannot be renamed. Move the stock to the correct lot instead.`,
      );
    }

    try {
      await this.tenantDb.update(
        lots,
        {
          code: input.code,
          ...(input.expiresAt !== undefined
            ? { expiresAt: new Date(input.expiresAt) }
            : {}),
        },
        eq(lots.id, lotId),
      );
    } catch (error) {
      // The unique index on (organization_id, variant_id, code). Merging two
      // lots is a different operation with its own rules, not a rename.
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `${input.code} already exists for this item`,
        );
      }
      throw error;
    }

    this.logger.log(`Lot ${lotId} updated`);
  }
}
