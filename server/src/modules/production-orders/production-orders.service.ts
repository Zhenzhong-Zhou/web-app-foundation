import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { NOTIFICATION_TYPES } from '../../core/notifications/notification-types';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { isForeignKeyViolation } from '../../database/errors';
import {
  boms,
  locations,
  productionOrderLines,
  productionOrders,
  productLicences,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { assertTakeable } from '../stock/availability';
import {
  allocateFefo,
  type LotCandidate,
  lotCandidates,
} from '../stock/lot-allocation';
import { StockService } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type {
  CreateProductionOrderDto,
  ListProductionOrdersDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import type {
  CancelProductionOrderDto,
  CloseProductionOrderDto,
  IssuePlanQueryDto,
  RecordOutputDto,
  ReleaseProductionOrderDto,
} from './dto/transitions.dto';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

/**
 * Local, unlike the exported row types below: it appears only in a private
 * helper's signature, so declaration emit never has to name it.
 */
type Bom = typeof boms.$inferSelect;
/**
 * Exported because they appear in this service's public return types, and a
 * type the controller's inferred signature references has to be nameable from
 * outside the module or declaration emit fails (TS4053).
 */
export type ProductionOrder = typeof productionOrders.$inferSelect;
export type ProductionOrderLine = typeof productionOrderLines.$inferSelect;

/** One recipe line as release would issue it, lots included (ADR-039). */
export interface IssuePlanLine {
  componentVariantId: string;
  sku: string;
  unitOfMeasure: string;
  tracksLots: boolean;
  supplyType: 'stocked' | 'external';
  quantity: string;
  lots: LotCandidate[];
  shortBy: string | null;
}

/**
 * Flagged, never blocked (ADR-032). A cap that refuses to record a real event
 * does not prevent the event — it makes someone type the planned figure
 * instead, and a fiction that looks clean is worse than a variance that does
 * not.
 */
const VARIANCE_FLAG_RATIO = 0.1;

const DEFAULT_LIMIT = 25;

/**
 * How the batch itself came out against its plan (ADR-032's rule applied to
 * output). Null unless it is far enough off to be worth saying.
 */
export interface OutputVariance {
  quantityPlanned: string;
  quantityProduced: string;
  /** Positive is over plan. Computed, never stored. */
  variance: number;
}

export interface LineVariance {
  lineId: string;
  componentVariantId: string;
  /** Snapshotted on the line at release — a UUID reads as nothing in a bell. */
  sku: string;
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
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Keyset paging, in the envelope /orders uses (ADR-018).
   *
   * One row over the limit is fetched and dropped. That extra row is the only
   * honest way to answer "is there more" — inferring it from a full page is
   * wrong exactly once, on a final page that happens to be full, and the
   * symptom is a Load more button that returns nothing.
   */
  async list(query: ListProductionOrdersDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;

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

    const rows = await this.tenantDb.select(
      productionOrders,
      filters.length > 0 ? and(...filters) : undefined,
      { orderBy: [desc(productionOrders.id)], limit: limit + 1 },
    );

    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;

    return {
      entries,
      nextCursor: hasMore ? entries[entries.length - 1].id : null,
    };
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
      componentLots: await this.componentLots(run),
      outputLots: [
        ...new Set(
          outputLots
            .map((movement) => movement.lotId)
            .filter((lotId): lotId is string => lotId !== null),
        ),
      ],
    };
  }

  /**
   * Which lot of each component went into this run, and how much of it was
   * consumed — the recall question, answered from the ledger (ADR-039).
   * Issued counts transfers into the run's location, top-ups included;
   * consumed counts what close used up.
   */
  private async componentLots(run: ProductionOrder) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const result = await tx.execute(sql`
        select
          sm.variant_id as component_variant_id,
          sm.lot_id,
          l.code,
          l.expires_at,
          coalesce(
            sum(sm.quantity) filter (
              where sm.reason = 'transfer'
                and sm.to_location_id = ${run.locationId}::uuid
            ),
            0
          )::text as issued,
          coalesce(
            sum(sm.quantity) filter (where sm.reason = 'consumption'),
            0
          )::text as consumed
        from stock_movements sm
        join lots l on l.id = sm.lot_id
        where sm.organization_id = ${organizationId}::uuid
          and sm.reference_type = 'production_order'
          and sm.reference_id = ${run.id}::uuid
          and sm.reason in ('transfer', 'consumption')
        group by sm.variant_id, sm.lot_id, l.code, l.expires_at
        order by l.expires_at asc nulls last, l.code asc
      `);

      return result.rows.map((row) => ({
        componentVariantId: row.component_variant_id as string,
        lotId: row.lot_id as string,
        code: row.code as string,
        expiresAt: (row.expires_at as Date | null) ?? null,
        issued: row.issued as string,
        consumed: row.consumed as string,
      }));
    });
  }

  /**
   * What release would issue from a source, and from which lots, without
   * moving anything (ADR-039).
   *
   * The release dialog shows this so the earliest-expiry pick is visible
   * before it happens and can be changed. Read-only and unlocked: stock can
   * move between the preview and the release, and release recomputes rather
   * than trusting what the dialog saw. Scaling is the same SQL expression
   * release uses, so the numbers agree.
   */
  async issuePlan(runId: string, query: IssuePlanQueryDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { run, bom } = await this.loadForIssue(tx, organizationId, runId);

      const planned = await tx.execute(sql`
        select
          bl.component_variant_id,
          pv.sku,
          pv.unit_of_measure,
          pv.tracks_lots,
          bl.supply_type,
          round(
            bl.quantity * (${run.quantityPlanned}::numeric / ${bom.outputQuantity}::numeric),
            4
          )::text as quantity
        from bom_lines bl
        join product_variants pv on pv.id = bl.component_variant_id
        where bl.bom_id = ${bom.id}::uuid
          and bl.organization_id = ${organizationId}::uuid
        order by pv.sku
      `);

      const lines: IssuePlanLine[] = [];

      for (const row of planned.rows) {
        const line: IssuePlanLine = {
          componentVariantId: row.component_variant_id as string,
          sku: row.sku as string,
          unitOfMeasure: row.unit_of_measure as string,
          tracksLots: row.tracks_lots as boolean,
          supplyType: row.supply_type as 'stocked' | 'external',
          quantity: row.quantity as string,
          lots: [],
          shortBy: null,
        };

        if (line.supplyType === 'stocked' && line.tracksLots) {
          const { candidates, shortBy } = await lotCandidates(tx, {
            organizationId,
            variantId: line.componentVariantId,
            locationId: query.sourceLocationId,
            quantity: line.quantity,
          });

          line.lots = candidates;
          line.shortBy = shortBy;
        }

        lines.push(line);
      }

      return { lines };
    });
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
            reference: input.reference,
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
      const { run, bom } = await this.loadForIssue(tx, organizationId, runId);

      /**
       * Retained or quarantined stock is not raw material. A retention bin is
       * marked unavailable so it cannot be sent anywhere — issuing it into a
       * new batch would be the same mistake by another route (ADR-042).
       */
      const sources = [
        input.sourceLocationId,
        ...(input.overrides ?? []).map((line) => line.sourceLocationId),
      ];

      const [held] = await tx
        .select({ name: locations.name })
        .from(locations)
        .where(
          and(
            eq(locations.organizationId, organizationId),
            inArray(locations.id, sources),
            eq(locations.isAvailable, false),
          ),
        )
        .limit(1);

      if (held) {
        throw new ConflictException(
          `${held.name} holds stock that is not for use. Pick components from an available location.`,
        );
      }

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
        where bl.bom_id = ${bom.id}::uuid
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

      const tracked = await trackedVariants(
        tx,
        organizationId,
        issued.map((line) => line.componentVariantId),
      );

      // Hand-picked lots only make sense for a line that moves lot-tracked
      // stock. Anything else is a mistake worth a 400, not a silent ignore.
      const picked = new Map(
        (input.lots ?? []).map((entry) => [
          entry.componentVariantId,
          entry.lots,
        ]),
      );

      for (const componentVariantId of picked.keys()) {
        const line = issued.find(
          (row) => row.componentVariantId === componentVariantId,
        );

        if (!line || line.supplyType !== 'stocked') {
          throw new BadRequestException(
            'Lots were given for a component this run does not issue from stock',
          );
        }

        if (!tracked.has(componentVariantId)) {
          throw new BadRequestException(
            `${line.sku} is not lot tracked, so it cannot be issued by lot`,
          );
        }
      }

      /**
       * Components a customer has been promised are not raw material
       * (ADR-045). Checked in product order, so the product locks cannot
       * deadlock with a shipment taking the same ones.
       */
      const committed = issued
        .filter((line) => line.supplyType === 'stocked')
        .sort((a, b) =>
          a.componentVariantId < b.componentVariantId
            ? -1
            : a.componentVariantId > b.componentVariantId
              ? 1
              : 0,
        );

      for (const line of committed) {
        await assertTakeable(tx, {
          organizationId,
          variantId: line.componentVariantId,
          quantity: line.quantityPlanned,
          sku: line.sku,
        });
      }

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

        /**
         * Nothing to move when the components are already where the work
         * happens — the common shape for a single-site maker, who stores and
         * blends in the same room. A transfer to its own location is refused
         * by stock_movements_distinct_locations_check, and rightly: it would
         * be a ledger row claiming something happened that did not. Close
         * then consumes straight from that location.
         */
        if (line.sourceLocationId === run.locationId) continue;

        // One transfer per lot, so the ledger records exactly which lots
        // went to the run. An untracked component is one transfer, as before.
        const allocations = tracked.has(line.componentVariantId)
          ? await this.lotsToIssue(
              tx,
              organizationId,
              line,
              line.sourceLocationId,
              picked.get(line.componentVariantId),
            )
          : [{ lotId: null, quantity: line.quantityPlanned }];

        for (const allocation of allocations) {
          await this.stock.recordWithin(
            tx,
            organizationId,
            {
              variantId: line.componentVariantId,
              lotId: allocation.lotId,
              fromLocationId: line.sourceLocationId,
              toLocationId: run.locationId,
              quantity: allocation.quantity,
              reason: 'transfer',
              referenceType: 'production_order',
              referenceId: runId,
            },
            actorId,
          );
        }
      }

      /**
       * The licence, snapshotted alongside the lines (ADR-040). Read through
       * the organization, like every lookup here, and copied as text as
       * well as by id: a finished batch keeps what it was made under even if
       * the licence row is later corrected.
       */
      const [licence] = bom.licenceId
        ? await tx
            .select()
            .from(productLicences)
            .where(
              and(
                eq(productLicences.organizationId, organizationId),
                eq(productLicences.id, bom.licenceId),
              ),
            )
        : [];

      await tx
        .update(productionOrders)
        .set({
          status: 'released',
          licenceId: licence?.id ?? null,
          licenceNumber: licence?.number ?? null,
          licenceAuthority: licence?.authority ?? null,
        })
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
  ): Promise<{
    variances: LineVariance[];
    outputVariance: OutputVariance | null;
  }> {
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
          ? (
              await tx
                .select()
                .from(productionOrderLines)
                .where(
                  and(
                    eq(productionOrderLines.productionOrderId, runId),
                    eq(productionOrderLines.supplyType, 'stocked'),
                  ),
                )
                .orderBy(asc(productionOrderLines.id))
            ).filter(
              // Issued in place moved nothing, so nothing is stranded.
              (line) => line.sourceLocationId !== run.locationId,
            )
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
   * The run and the recipe behind it, for the two paths that answer "what
   * would this issue": the preview and the release itself.
   *
   * Shared so they cannot drift. A preview built from a different recipe, or
   * one that allowed a status release refuses, would show somebody a plan
   * they cannot act on. What differs comes after: release copies the lines
   * and takes locks, the preview does neither.
   */
  private async loadForIssue(
    tx: Tx,
    organizationId: string,
    runId: string,
  ): Promise<{ run: ProductionOrder; bom: Bom }> {
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

    return { run, bom };
  }

  /**
   * The lots one tracked line is issued from: the person's pick if they made
   * one, otherwise earliest expiry first.
   *
   * A pick must add up to exactly what the line needs. Checked in SQL,
   * because summing decimal strings in JavaScript is the drift ADR-025 exists
   * to prevent. Whether each lot belongs to the component and holds enough at
   * the source is left to the stock service, which already refuses both.
   */
  private async lotsToIssue(
    tx: Tx,
    organizationId: string,
    line: ProductionOrderLine,
    sourceLocationId: string,
    picked: { lotId: string; quantity: string }[] | undefined,
  ): Promise<{ lotId: string; quantity: string }[]> {
    if (!picked) {
      return allocateFefo(tx, {
        organizationId,
        variantId: line.componentVariantId,
        locationId: sourceLocationId,
        quantity: line.quantityPlanned,
        sku: line.sku,
      });
    }

    const values = sql.join(
      picked.map((entry) => sql`(${entry.quantity}::numeric)`),
      sql`, `,
    );

    const result = await tx.execute(sql`
      select
        sum(v.q) = ${line.quantityPlanned}::numeric as matches,
        sum(v.q)::text as total
      from (values ${values}) as v(q)
    `);

    const [check] = result.rows as { matches: boolean; total: string }[];

    if (!check.matches) {
      throw new BadRequestException(
        `The lots chosen for ${line.sku} add up to ${check.total}, but the run needs ${line.quantityPlanned}`,
      );
    }

    return picked;
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
