import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';

import { instantRange } from '../../common/date-range';
import { pageOf } from '../../common/keyset';
import { codeMatches, searchTerms } from '../../common/search';
import { isForeignKeyViolation } from '../../database/errors';
import {
  boms,
  productionOrderLines,
  productionOrders,
  stockMovements,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { type LotCandidate, lotCandidates } from '../stock/lot-allocation';
import type {
  CreateProductionOrderDto,
  ListProductionOrdersDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import type {
  CancelProductionOrderDto,
  IssuePlanQueryDto,
} from './dto/transitions.dto';
import { checkLicence } from './licence-check';
import { assertStatus, loadForIssue, loadWithin } from './run-guards';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

/**
 * Local, unlike the exported row types below: it appears only in a private
 * helper's signature, so declaration emit never has to name it.
 */
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

  constructor(private readonly tenantDb: TenantDb) {}

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
      // When planned (ADR-057).
      ...instantRange(productionOrders.createdAt, query),
      // Its reference (ADR-056).
      query.search
        ? codeMatches(productionOrders.reference, searchTerms(query.search))
        : undefined,
    ].filter((f): f is NonNullable<typeof f> => f !== undefined);

    const rows = await this.tenantDb.select(
      productionOrders,
      filters.length > 0 ? and(...filters) : undefined,
      { orderBy: [desc(productionOrders.id)], limit: limit + 1 },
    );

    return pageOf(rows, limit);
  }

  async findById(runId: string) {
    const [run] = await this.tenantDb.select(
      productionOrders,
      eq(productionOrders.id, runId),
    );

    if (!run)
      throw new NotFoundException(
        t({
          id: 'production.suchProductionOrder',
          defaultMessage: 'No such production order',
        }),
      );

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
      licenceOverriddenByName: run.licenceOverriddenBy
        ? await this.nameOf(run.licenceOverriddenBy)
        : null,
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
   * Who overrode the licence policy at release, by name, for the run page's
   * "released by" (ADR-050). Reached through the run, which is already this
   * organization's, so the id cannot lead to another tenant's member. The
   * name is whatever the row holds now: someone since removed reads as
   * ADR-012 anonymised them, not as who they were.
   */
  private async nameOf(userId: string): Promise<string | null> {
    return this.tenantDb.transaction(async (tx) => {
      const [user] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId));

      return user?.name ?? null;
    });
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
        expiresAt: (row.expires_at as string | null) ?? null,
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
   *
   * With it, what release would do with the recipe's licence (ADR-050), from
   * the same check release runs, so the dialog can show a refusal or ask
   * for a reason before Release is pressed. Unlocked, like the rest.
   */
  async issuePlan(runId: string, query: IssuePlanQueryDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { run, bom } = await loadForIssue(tx, organizationId, runId);

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

      const licenceCheck = await checkLicence(
        tx,
        organizationId,
        bom.licenceId,
        { lock: false },
      );

      return { lines, licenceCheck };
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
            t({
              id: 'production.outputvariantidBomidLocationidPartnerid',
              defaultMessage:
                'outputVariantId, bomId, locationId, or partnerId does not exist',
            }),
          );
        }
        throw error;
      }
    });
  }

  async update(runId: string, input: UpdateProductionOrderDto): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const run = await loadWithin(tx, organizationId, runId);

      assertStatus(run.status, 'draft', 'edited');

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
            t({
              id: 'production.bomidLocationidPartneridDoes',
              defaultMessage: 'bomId, locationId, or partnerId does not exist',
            }),
          );
        }
        throw error;
      }

      this.logger.log(`Production order ${runId} updated`);
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
      const run = await loadWithin(tx, organizationId, runId);

      if (run.status === 'completed' || run.status === 'cancelled') {
        throw new ConflictException(
          t(
            {
              id: 'production.statusRunCancelled',
              defaultMessage: 'A {status} run cannot be cancelled',
            },
            { status: run.status },
          ),
        );
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

    if (!bom)
      throw new BadRequestException(
        t({
          id: 'production.bomidDoesExist',
          defaultMessage: 'bomId does not exist',
        }),
      );

    if (bom.outputVariantId !== outputVariantId) {
      throw new BadRequestException(
        t({
          id: 'production.bomMakesDifferentVariant',
          defaultMessage: 'That BOM makes a different variant than this run',
        }),
      );
    }
  }
}
