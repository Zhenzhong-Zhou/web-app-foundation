import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';

import { isForeignKeyViolation } from '../../database/errors';
import {
  boms,
  productionOrderLines,
  productionOrders,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { StockService } from '../stock/stock.service';
import type {
  CreateProductionOrderDto,
  ListProductionOrdersDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import type {
  CancelProductionOrderDto,
  CloseProductionOrderDto,
  RecordOutputDto,
  ReleaseProductionOrderDto,
} from './dto/transitions.dto';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];
/**
 * Exported because they appear in this service's public return types, and a
 * type the controller's inferred signature references has to be nameable from
 * outside the module or declaration emit fails (TS4053).
 */
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type ProductionOrderLine = typeof productionOrderLines.$inferSelect;

/**
 * Flagged, never blocked (ADR-032). A cap that refuses to record a real event
 * does not prevent the event — it makes someone type the planned figure
 * instead, and a fiction that looks clean is worse than a variance that does
 * not.
 */
const VARIANCE_FLAG_RATIO = 0.1;

export interface LineVariance {
  lineId: string;
  componentVariantId: string;
  quantityPlanned: string;
  quantityConsumed: string;
  /** Positive is over plan. Computed, never stored. */
  variance: number;
}

/**
 * Making one variant out of others (ADR-030, ADR-032).
 *
 * Four transitions, each a transaction, each writing to the ledger through
 * StockService.recordWithin so there is exactly one path into
 * `stock_movements` (ADR-023).
 *
 *   release — copies lines from the BOM and issues components to the run
 *   output  — repeatable; a batch spanning days reports several times
 *   close   — consumes actual quantities and ends the run
 *   cancel  — stops it, leaving issued material for a person to deal with
 */
@Injectable()
export class ProductionOrdersService {
  private readonly logger = new Logger(ProductionOrdersService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  list(query: ListProductionOrdersDto) {
    const filters = [
      query.status ? eq(productionOrders.status, query.status) : undefined,
      query.outputVariantId
        ? eq(productionOrders.outputVariantId, query.outputVariantId)
        : undefined,
      query.partnerId
        ? eq(productionOrders.partnerId, query.partnerId)
        : undefined,
      query.before ? lt(productionOrders.id, query.before) : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    return this.tenantDb.select(
      productionOrders,
      filters.length > 0 ? and(...filters) : undefined,
      { orderBy: [desc(productionOrders.id)], limit: 50 },
    );
  }

  async findById(runId: string) {
    const [run] = await this.tenantDb.select(
      productionOrders,
      eq(productionOrders.id, runId),
    );

    if (!run) throw new NotFoundException('No such production order');

    return run;
  }

  /**
   * The run, its lines, and the lots it has produced so far.
   *
   * `outputLots` is read from the ledger rather than a column, because a run
   * can produce several and the movements already carry one each (ADR-030).
   * The output dialog needs them to offer joining an open lot instead of
   * asking someone to retype a code.
   */
  async findDetail(runId: string) {
    const run = await this.findById(runId);

    const [lines, outputLots] = await Promise.all([
      this.tenantDb.select(
        productionOrderLines,
        eq(productionOrderLines.productionOrderId, runId),
        { orderBy: [asc(productionOrderLines.id)] },
      ),
      this.tenantDb.select(
        stockMovements,
        and(
          eq(stockMovements.referenceType, 'production_order'),
          eq(stockMovements.referenceId, runId),
          eq(stockMovements.reason, 'production'),
        ),
        { orderBy: [asc(stockMovements.id)] },
      ),
    ]);

    return {
      ...run,
      lines,
      outputLots: [
        ...new Set(
          outputLots
            .map((movement) => movement.lotId)
            .filter((lotId): lotId is string => lotId !== null),
        ),
      ],
    };
  }

  async create(input: CreateProductionOrderDto): Promise<ProductionOrder> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      if (input.bomId) {
        await this.assertBomMatches(
          tx,
          organizationId,
          input.bomId,
          input.outputVariantId,
        );
      }

      try {
        const [run] = await tx
          .insert(productionOrders)
          .values({
            organizationId,
            outputVariantId: input.outputVariantId,
            bomId: input.bomId,
            locationId: input.locationId,
            partnerId: input.partnerId,
            quantityPlanned: input.quantityPlanned,
            notes: input.notes,
            status: 'draft',
          })
          .returning();

        this.logger.log(`Production order ${run.id} created`);
        return run;
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new BadRequestException(
            'outputVariantId, bomId, locationId, or partnerId does not exist',
          );
        }
        throw error;
      }
    });
  }

  async update(runId: string, input: UpdateProductionOrderDto): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await this.loadWithin(tx, organizationId, runId);

      this.assertStatus(run.status, 'draft', 'edited');

      if (input.bomId) {
        await this.assertBomMatches(
          tx,
          organizationId,
          input.bomId,
          run.outputVariantId,
        );
      }

      try {
        await tx
          .update(productionOrders)
          .set(input)
          .where(eq(productionOrders.id, runId));
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new BadRequestException(
            'bomId, locationId, or partnerId does not exist',
          );
        }
        throw error;
      }

      this.logger.log(`Production order ${runId} updated`);
    });
  }

  /**
   * Copies the recipe onto the run and issues components to it.
   *
   * The copy is the snapshot ADR-029 depends on: from this moment nothing
   * reads through to the BOM, so editing or archiving the recipe afterwards
   * cannot change what this run says it consumed.
   *
   * Scaling is done in SQL, not JavaScript. `quantity * (planned / yield)`
   * over numeric(18,4) values is exactly the arithmetic ADR-025 chose numeric
   * for, and pulling three decimals through a JS double to multiply them is
   * how a recipe for 2.4 kg becomes 2.4000000000000004.
   */
  async release(
    runId: string,
    input: ReleaseProductionOrderDto,
    actorId: string,
  ): Promise<ProductionOrderLine[]> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await this.loadWithin(tx, organizationId, runId);

      this.assertStatus(run.status, 'draft', 'released');

      if (!run.bomId) {
        throw new ConflictException(
          'This run has no BOM, so there is nothing to issue — attach one first',
        );
      }

      const [bom] = await tx
        .select()
        .from(boms)
        .where(
          and(eq(boms.organizationId, organizationId), eq(boms.id, run.bomId)),
        );

      if (!bom) throw new NotFoundException('No such BOM');

      const lines = await tx.execute(sql`
        insert into production_order_lines (
          organization_id, production_order_id, component_variant_id,
          sku, unit_of_measure, quantity_planned, supply_type, source_location_id
        )
        select
          ${organizationId}::uuid,
          ${runId}::uuid,
          bl.component_variant_id,
          pv.sku,
          pv.unit_of_measure,
          round(
            bl.quantity * (${run.quantityPlanned}::numeric / ${bom.outputQuantity}::numeric),
            4
          ),
          bl.supply_type,
          case when bl.supply_type = 'stocked' then ${input.sourceLocationId}::uuid end
        from bom_lines bl
        join product_variants pv on pv.id = bl.component_variant_id
        where bl.bom_id = ${run.bomId}::uuid
          and bl.organization_id = ${organizationId}::uuid
        returning *
      `);

      if (lines.rows.length === 0) {
        throw new ConflictException(
          'That BOM has no lines, so this run would consume nothing',
        );
      }

      for (const override of input.overrides ?? []) {
        await tx
          .update(productionOrderLines)
          .set({ sourceLocationId: override.sourceLocationId })
          .where(
            and(
              eq(productionOrderLines.productionOrderId, runId),
              eq(
                productionOrderLines.componentVariantId,
                override.componentVariantId,
              ),
              eq(productionOrderLines.supplyType, 'stocked'),
            ),
          );
      }

      const issued = await tx
        .select()
        .from(productionOrderLines)
        .where(eq(productionOrderLines.productionOrderId, runId))
        .orderBy(asc(productionOrderLines.id));

      /**
       * Issuing is a transfer, not a consumption. The material has moved to
       * where the work happens and is still ours — which is the whole reason a
       * co-packer's site is an ordinary location (ADR-030). Consumption
       * happens at close, with the quantity actually used.
       *
       * External lines move nothing: we never held them.
       */
      for (const line of issued) {
        if (line.supplyType !== 'stocked' || !line.sourceLocationId) continue;

        await this.stock.recordWithin(
          tx,
          organizationId,
          {
            variantId: line.componentVariantId,
            fromLocationId: line.sourceLocationId,
            toLocationId: run.locationId,
            quantity: line.quantityPlanned,
            reason: 'transfer',
            referenceType: 'production_order',
            referenceId: runId,
          },
          actorId,
        );
      }

      await tx
        .update(productionOrders)
        .set({ status: 'released' })
        .where(eq(productionOrders.id, runId));

      this.logger.log(
        `Production order ${runId} released with ${issued.length} lines`,
      );

      return issued;
    });
  }

  /**
   * Repeatable. A batch spanning three days reports output three times, and
   * the run stays `released` until somebody closes it (ADR-032) — a run yielding
   * 980 against a planned 1000 is finished, not 20 short.
   */
  async recordOutput(runId: string, input: RecordOutputDto, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await this.loadWithin(tx, organizationId, runId);

      this.assertStatus(run.status, 'released', 'credited with output');

      const movement = await this.stock.recordWithin(
        tx,
        organizationId,
        {
          variantId: run.outputVariantId,
          toLocationId: run.locationId,
          quantity: input.quantity,
          reason: 'production',
          referenceType: 'production_order',
          referenceId: runId,
          lotId: input.lotId,
          lot: input.lot,
          note: input.note,
        },
        actorId,
      );

      // Accumulated in SQL for the reason the scaling is: numeric stays exact
      // only while the arithmetic stays in the database.
      await tx
        .update(productionOrders)
        .set({
          quantityProduced: sql`${productionOrders.quantityProduced} + ${input.quantity}::numeric`,
        })
        .where(eq(productionOrders.id, runId));

      this.logger.log(`Production order ${runId} produced ${input.quantity}`);

      return movement;
    });
  }

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
  ): Promise<{ variances: LineVariance[] }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await this.loadWithin(tx, organizationId, runId);

      this.assertStatus(run.status, 'released', 'closed');

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

      for (const line of lines) {
        if (line.supplyType !== 'stocked') continue;

        const consumed = actuals.get(line.id) ?? line.quantityPlanned;
        const shortfall = this.difference(consumed, line.quantityPlanned);

        if (shortfall > 0 && line.sourceLocationId) {
          await this.stock.recordWithin(
            tx,
            organizationId,
            {
              variantId: line.componentVariantId,
              fromLocationId: line.sourceLocationId,
              toLocationId: run.locationId,
              quantity: shortfall.toFixed(4),
              reason: 'transfer',
              referenceType: 'production_order',
              referenceId: runId,
              note: 'Top-up for consumption over plan',
            },
            actorId,
          );
        }

        await this.stock.recordWithin(
          tx,
          organizationId,
          {
            variantId: line.componentVariantId,
            fromLocationId: run.locationId,
            quantity: consumed,
            reason: 'consumption',
            referenceType: 'production_order',
            referenceId: runId,
            note: input.note,
          },
          actorId,
        );

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
            quantityPlanned: line.quantityPlanned,
            quantityConsumed: consumed,
            variance: Number(ratio.toFixed(4)),
          });
        }
      }

      await tx
        .update(productionOrders)
        .set({ status: 'completed' })
        .where(eq(productionOrders.id, runId));

      this.logger.log(
        variances.length > 0
          ? `Production order ${runId} closed with ${variances.length} lines over threshold`
          : `Production order ${runId} closed`,
      );

      return { variances };
    });
  }

  /**
   * Stops the run. Anything already issued stays where it is.
   *
   * Cancelling does not unwind movements: material at the run's location is
   * physically there, and a reversing movement invented here would claim
   * somebody moved it back. The response says what is sitting there so a
   * person can put it away (ADR-032).
   */
  async cancel(
    runId: string,
    input: CancelProductionOrderDto,
  ): Promise<{ strandedLines: ProductionOrderLine[] }> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await this.loadWithin(tx, organizationId, runId);

      if (run.status === 'completed' || run.status === 'cancelled') {
        throw new ConflictException(`A ${run.status} run cannot be cancelled`);
      }

      const stranded =
        run.status === 'released'
          ? await tx
              .select()
              .from(productionOrderLines)
              .where(
                and(
                  eq(productionOrderLines.productionOrderId, runId),
                  eq(productionOrderLines.supplyType, 'stocked'),
                ),
              )
              .orderBy(asc(productionOrderLines.id))
          : [];

      await tx
        .update(productionOrders)
        .set({
          status: 'cancelled',
          notes: run.notes
            ? `${run.notes}\n\nCancelled: ${input.reason}`
            : `Cancelled: ${input.reason}`,
        })
        .where(eq(productionOrders.id, runId));

      this.logger.log(
        `Production order ${runId} cancelled, ${stranded.length} lines still issued`,
      );

      return { strandedLines: stranded };
    });
  }

  // ---------------------------------------------------------------------------

  private assertStatus(actual: string, required: string, verb: string): void {
    if (actual !== required) {
      throw new ConflictException(
        `A ${actual} run cannot be ${verb} — it must be ${required}`,
      );
    }
  }

  private async loadWithin(tx: Tx, organizationId: string, runId: string) {
    const [run] = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.organizationId, organizationId),
          eq(productionOrders.id, runId),
        ),
      );

    if (!run) throw new NotFoundException('No such production order');

    return run;
  }

  /**
   * A BOM for a different variant would issue the wrong components and credit
   * the wrong stock row, and nothing downstream would notice — the run would
   * simply be wrong.
   */
  private async assertBomMatches(
    tx: Tx,
    organizationId: string,
    bomId: string,
    outputVariantId: string,
  ): Promise<void> {
    const [bom] = await tx
      .select()
      .from(boms)
      .where(and(eq(boms.organizationId, organizationId), eq(boms.id, bomId)));

    if (!bom) throw new BadRequestException('bomId does not exist');

    if (bom.outputVariantId !== outputVariantId) {
      throw new BadRequestException(
        'That BOM makes a different variant than this run',
      );
    }
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
