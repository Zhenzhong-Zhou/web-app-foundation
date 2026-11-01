import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { readableQuantity } from '../../common/readable-quantity';
import {
  type FieldValues,
  recordContext,
  recordPrevious,
} from '../../core/audit/audit-context';
import { productVariants, reorderPoints } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { SetReorderPointDto } from './dto/set-reorder-point.dto';
import type { Tx } from './stock.service';

/** A point's own columns, as kept and as the log reads them. */
interface PointValues {
  source: string;
  reorderPoint: string;
  rule: string;
  fixedQuantity: string | null;
  maximumQuantity: string | null;
}

const POINT_COLUMNS = {
  source: reorderPoints.source,
  reorderPoint: reorderPoints.reorderPoint,
  rule: reorderPoints.rule,
  fixedQuantity: reorderPoints.fixedQuantity,
  maximumQuantity: reorderPoints.maximumQuantity,
};

/**
 * Setting, changing and removing an item's reorder point (ADR-085), by
 * the item's id: an item has one point at most. What is low, and what to
 * order, is read from the points, never kept beside them.
 */
@Injectable()
export class ReorderPointsService {
  private readonly logger = new Logger(ReorderPointsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Adds an item's point. Refused when it has one, by the unique index
   * rather than a read first, so two people adding at once cannot both
   * succeed; the dialog offers to change the one there is.
   */
  async create(variantId: string, input: SetReorderPointDto): Promise<void> {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const [variant] = await tx
        .select({ sku: productVariants.sku })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.organizationId, organizationId),
          ),
        );

      // In the path, so a variant that is not this organization's is not
      // found, as any other path id is.
      if (!variant)
        throw new NotFoundException(
          t({ id: 'stock.suchItem', defaultMessage: 'No such item' }),
        );

      await refuseMaximumAtOrBelowPoint(tx, input);

      const [created] = await tx
        .insert(reorderPoints)
        .values({ organizationId, variantId, ...keptOf(input) })
        .onConflictDoNothing({
          target: [reorderPoints.organizationId, reorderPoints.variantId],
        })
        .returning({ id: reorderPoints.id });

      if (!created)
        throw new ConflictException(
          withCode(
            t(
              {
                id: 'stock.reorderPointExists',
                defaultMessage:
                  '{sku} already has a reorder point. Change it instead.',
              },
              { sku: variant.sku },
            ),
            ERROR_CODES.reorderPointExists,
          ),
        );

      // What was kept, read as the log reads it: the body may also carry a
      // quantity its rule does not use.
      recordContext(loggedOf(keptOf(input)));
    });

    this.logger.log(`Reorder point added for ${variantId}`);
  }

  /** Changes an item's point, every part of it at once. */
  async update(variantId: string, input: SetReorderPointDto): Promise<void> {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const [existing] = await tx
        .select(POINT_COLUMNS)
        .from(reorderPoints)
        .where(
          and(
            eq(reorderPoints.organizationId, organizationId),
            eq(reorderPoints.variantId, variantId),
          ),
        )
        .for('update');

      if (!existing) throw noPoint();

      await refuseMaximumAtOrBelowPoint(tx, input);

      // The quantity a rule does not use, as null, so a change of rule
      // reads as one quantity going and the other coming.
      recordPrevious({
        fixedQuantity: null,
        maximumQuantity: null,
        ...loggedOf(existing),
      });

      await tx
        .update(reorderPoints)
        .set(keptOf(input))
        .where(
          and(
            eq(reorderPoints.organizationId, organizationId),
            eq(reorderPoints.variantId, variantId),
          ),
        );
    });

    this.logger.log(`Reorder point changed for ${variantId}`);
  }

  /** Removes an item's point: it is never low again until one is set. */
  async remove(variantId: string): Promise<void> {
    const [removed] = await this.tenantDb
      .delete(reorderPoints, eq(reorderPoints.variantId, variantId))
      .returning(POINT_COLUMNS);

    if (!removed) throw noPoint();

    // What it was, so the log says what went.
    recordContext(loggedOf(removed));

    this.logger.log(`Reorder point removed for ${variantId}`);
  }
}

/** What a point keeps of the request: the rule's own quantity alone. */
export function keptOf(input: SetReorderPointDto): PointValues {
  return {
    source: input.source,
    reorderPoint: input.reorderPoint,
    rule: input.rule,
    fixedQuantity:
      input.rule === 'fixed' ? (input.fixedQuantity ?? null) : null,
    maximumQuantity:
      input.rule === 'maximum' ? (input.maximumQuantity ?? null) : null,
  };
}

/**
 * A point as the audit log reads it (ADR-085: its numbers, its rule, and
 * bought or made): "2000", not "2000.0000", and the quantity its rule does
 * not use left out.
 */
function loggedOf(point: PointValues): FieldValues {
  return {
    source: point.source,
    reorderPoint: readableQuantity(point.reorderPoint),
    rule: point.rule,
    ...(point.fixedQuantity && {
      fixedQuantity: readableQuantity(point.fixedQuantity),
    }),
    ...(point.maximumQuantity && {
      maximumQuantity: readableQuantity(point.maximumQuantity),
    }),
  };
}

/**
 * A maximum fills to a level above the point, which the check constraint
 * also holds; the preview refuses it alike. Compared in Postgres, never as
 * JavaScript numbers (ADR-025).
 */
export async function refuseMaximumAtOrBelowPoint(
  tx: Tx,
  input: SetReorderPointDto,
): Promise<void> {
  if (input.rule !== 'maximum' || !input.maximumQuantity) return;

  const { rows } = await tx.execute<{ above: boolean }>(
    sql`select ${input.maximumQuantity}::numeric > ${input.reorderPoint}::numeric as above`,
  );

  if (!rows[0].above)
    throw new BadRequestException(
      withCode(
        t(
          {
            id: 'stock.reorderMaximumAbovePoint',
            defaultMessage:
              'The maximum must be above the reorder point, {point}.',
          },
          { point: readableQuantity(input.reorderPoint) },
        ),
        ERROR_CODES.reorderMaximumNotAbovePoint,
      ),
    );
}

/** An item with no point: not found, as another organization's is. */
export function noPoint(): NotFoundException {
  return new NotFoundException(
    t({
      id: 'stock.noReorderPoint',
      defaultMessage: 'That item has no reorder point',
    }),
  );
}
