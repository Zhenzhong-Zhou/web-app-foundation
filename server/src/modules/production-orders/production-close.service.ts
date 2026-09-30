import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { NOTIFICATION_TYPES } from '../../core/notifications/notification-types';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { productionOrderLines, productionOrders } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { allocateFefo } from '../stock/lot-allocation';
import { postRunCost } from '../stock/revaluation';
import { StockService } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { CloseProductionOrderDto } from './dto/transitions.dto';
import type { LineVariance, OutputVariance } from './production-orders.service';
import { assertStatus, loadWithin } from './run-guards';

/**
 * Flagged, never blocked (ADR-032). A cap that refuses to record a real event
 * does not prevent the event — it makes someone type the planned figure
 * instead, and a fiction that looks clean is worse than a variance that does
 * not.
 */
const VARIANCE_FLAG_RATIO = 0.1;

/**
 * Closing a production order (ADR-032): the actual consumption written, the
 * variance against the recipe measured and flagged, and the batch costed
 * (ADR-048). The one step that settles a run for good, so it has its own
 * service; ProductionOrdersService plans and reads runs, and
 * ProductionExecutionService releases them and records output.
 */
@Injectable()
export class ProductionCloseService {
  private readonly logger = new Logger(ProductionCloseService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Consumes actual quantities and ends the run.
   *
   * A line whose actual exceeds what was issued gets a top-up transfer from
   * the same source first, in this transaction: release issued
   * `quantity_planned` to the run's location, so consuming more would hit
   * `stock_levels_quantity_non_negative_check` on a shortfall that is real
   * rather than a mistake (ADR-032). Two movements, both describing something
   * that happened, and the operator types one number.
   *
   * The opposite case is deliberately left alone. Issue 2400, consume 2380,
   * and 20 sits at the run's location afterwards — nothing here can know
   * whether it went back on the shelf, was binned, or is still in the mixer.
   */
  async close(
    runId: string,
    input: CloseProductionOrderDto,
    actorId: string,
  ): Promise<{
    variances: LineVariance[];
    outputVariance: OutputVariance | null;
  }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await loadWithin(tx, organizationId, runId);

      assertStatus(run.status, 'released', 'closed');

      const lines = await tx
        .select()
        .from(productionOrderLines)
        .where(eq(productionOrderLines.productionOrderId, runId))
        .orderBy(asc(productionOrderLines.id));

      const actuals = new Map(
        (input.lines ?? []).map((line) => [line.lineId, line.quantityConsumed]),
      );

      for (const lineId of actuals.keys()) {
        if (!lines.some((line) => line.id === lineId)) {
          throw new NotFoundException(`No line ${lineId} on this run`);
        }
      }

      const variances: LineVariance[] = [];

      const tracked = await trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.componentVariantId),
      );

      for (const line of lines) {
        if (line.supplyType !== 'stocked') continue;

        const consumed = actuals.get(line.id) ?? line.quantityPlanned;
        const shortfall = this.difference(consumed, line.quantityPlanned);

        const isTracked = tracked.has(line.componentVariantId);

        /**
         * True when release moved nothing because the source is the run's own
         * location. There is no top-up to make, and no set of issued lots to
         * consume within: the whole location is what this run drew on.
         */
        const issuedInPlace = line.sourceLocationId === run.locationId;

        if (shortfall > 0 && line.sourceLocationId && !issuedInPlace) {
          // A top-up follows the same rule as release: earliest expiry first
          // from the source, one transfer per lot (ADR-039).
          const topUps = isTracked
            ? await allocateFefo(tx, {
                organizationId,
                variantId: line.componentVariantId,
                locationId: line.sourceLocationId,
                quantity: shortfall.toFixed(4),
                sku: line.sku,
              })
            : [{ lotId: null, quantity: shortfall.toFixed(4) }];

          for (const topUp of topUps) {
            await this.stock.recordWithin(
              tx,
              organizationId,
              {
                variantId: line.componentVariantId,
                lotId: topUp.lotId,
                fromLocationId: line.sourceLocationId,
                toLocationId: run.locationId,
                quantity: topUp.quantity,
                reason: 'transfer',
                referenceType: 'production_order',
                referenceId: runId,
                note: 'Top-up for consumption over plan',
              },
              actorId,
            );
          }
        }

        // Consumed from the lots this run was given — not from whatever else
        // shares its location — so the recall trail stays exact.
        const consumption = isTracked
          ? await allocateFefo(tx, {
              organizationId,
              variantId: line.componentVariantId,
              locationId: run.locationId,
              quantity: consumed,
              sku: line.sku,
              fromRunId: issuedInPlace ? undefined : runId,
            })
          : [{ lotId: null, quantity: consumed }];

        for (const part of consumption) {
          await this.stock.recordWithin(
            tx,
            organizationId,
            {
              variantId: line.componentVariantId,
              lotId: part.lotId,
              fromLocationId: run.locationId,
              quantity: part.quantity,
              reason: 'consumption',
              referenceType: 'production_order',
              referenceId: runId,
              note: input.note,
            },
            actorId,
          );
        }

        await tx
          .update(productionOrderLines)
          .set({ quantityConsumed: consumed })
          .where(eq(productionOrderLines.id, line.id));

        const ratio =
          this.difference(consumed, line.quantityPlanned) /
          Number(line.quantityPlanned);

        if (Math.abs(ratio) >= VARIANCE_FLAG_RATIO) {
          variances.push({
            lineId: line.id,
            componentVariantId: line.componentVariantId,
            sku: line.sku,
            quantityPlanned: line.quantityPlanned,
            quantityConsumed: consumed,
            variance: Number(ratio.toFixed(4)),
          });
        }
      }

      /**
       * The batch against its own plan, flagged on the same threshold as the
       * components. Components being 10% off was reported while output six
       * times over said nothing, which is the wrong way round: the yield is
       * the number the run exists to produce. Flagged, never refused — a run
       * that made 1020 against 1000 is ordinary, and a run that made nothing
       * is worth knowing about rather than worth blocking.
       */
      const outputRatio =
        this.difference(run.quantityProduced, run.quantityPlanned) /
        Number(run.quantityPlanned);

      const outputVariance: OutputVariance | null =
        Math.abs(outputRatio) >= VARIANCE_FLAG_RATIO
          ? {
              quantityPlanned: run.quantityPlanned,
              quantityProduced: run.quantityProduced,
              variance: Number(outputRatio.toFixed(4)),
            }
          : null;

      // The batch's cost, now that what it consumed is valued (ADR-048).
      await postRunCost(tx, organizationId, runId, actorId);

      await tx
        .update(productionOrders)
        .set({ status: 'completed' })
        .where(eq(productionOrders.id, runId));

      this.logger.log(
        variances.length > 0 || outputVariance
          ? `Production order ${runId} closed with ${variances.length} lines and output ${outputVariance ? 'over' : 'within'} threshold`
          : `Production order ${runId} closed`,
      );

      /**
       * After the transaction, not inside it. emit uses its own connection, so
       * a notification written inside would survive a rollback and announce a
       * run that never closed — and it would hold the transaction open on an
       * insert nobody is waiting for (ADR-036).
       */
      if (variances.length > 0 || outputVariance) {
        const recipients = await this.notifications.recipientsWith(
          organizationId,
          PERMISSIONS.PRODUCTION_COMPLETE,
        );

        // The yield leads when it is off, because it is the run's own result;
        // the components explain it underneath.
        const title = outputVariance
          ? `A production run made ${run.quantityProduced} against a plan of ${run.quantityPlanned}`
          : `A production run closed with ${variances.length} line${variances.length === 1 ? '' : 's'} off plan`;

        await this.notifications.emit(
          recipients.map((userId) => ({
            userId,
            organizationId,
            type: NOTIFICATION_TYPES.PRODUCTION_VARIANCE,
            title,
            body:
              variances
                .map((v) => `${v.sku}: ${Math.round(v.variance * 100)}%`)
                .join(', ') || undefined,
            resourceType: 'production_order',
            resourceId: runId,
          })),
        );
      }

      return { variances, outputVariance };
    });
  }

  /**
   * Only for the threshold comparison and the top-up amount, both of which are
   * approximate by nature. Every quantity written to the ledger is passed
   * through as the string it arrived as, so no stored value goes near a
   * double.
   */
  private difference(actual: string, planned: string): number {
    return Number(actual) - Number(planned);
  }
}
