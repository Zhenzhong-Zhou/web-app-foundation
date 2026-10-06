import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import {
  locations,
  productionOrderLines,
  productionOrders,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { assertTakeable, inVariantOrder } from '../stock/availability';
import { allocateFefo } from '../stock/lot-allocation';
import { StockService } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type {
  RecordOutputDto,
  ReleaseProductionOrderDto,
} from './dto/transitions.dto';
type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];
import { t } from '../../i18n/translate';
import { checkLicence, settleLicence } from './licence-check';
import type { ProductionOrderLine } from './production-orders.service';
import { assertStatus, loadForIssue, loadWithin } from './run-guards';

/**
 * A production order on the floor (ADR-032): releasing it, which issues its
 * components from stock, and recording what it made. ProductionOrdersService
 * plans and reads runs; closing one is its own step.
 */
@Injectable()
export class ProductionExecutionService {
  private readonly logger = new Logger(ProductionExecutionService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

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
   *
   * The licence is checked first, before anything is written (ADR-050).
   */
  async release(
    runId: string,
    input: ReleaseProductionOrderDto,
    actorId: string,
  ): Promise<ProductionOrderLine[]> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { run, bom } = await loadForIssue(tx, organizationId, runId);

      /**
       * The recipe's licence against the organization's policy (ADR-050),
       * right after the run guards and before the first write. Its row is
       * locked FOR SHARE for the rest of this transaction, so a withdrawal
       * saved at the same moment cannot land halfway through a release. The
       * recipe's licence itself cannot change underneath: it locked when
       * this run was planned against it (ADR-040).
       */
      const licenceCheck = await checkLicence(
        tx,
        organizationId,
        bom.licenceId,
        { lock: true },
      );
      const licenceAtRelease = settleLicence(
        licenceCheck,
        input.licenceOverride,
        actorId,
      );

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
          t(
            {
              id: 'production.nameHoldsStockUse',
              defaultMessage:
                '{name} holds stock that is not for use. Pick components from an available location.',
            },
            { name: held.name },
          ),
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
          t({
            id: 'production.bomLinesSoRun',
            defaultMessage:
              'That BOM has no lines, so this run would consume nothing',
          }),
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
            t({
              id: 'production.lotsWereGivenComponent',
              defaultMessage:
                'Lots were given for a component this run does not issue from stock',
            }),
          );
        }

        if (!tracked.has(componentVariantId)) {
          throw new BadRequestException(
            t(
              {
                id: 'production.skuLotTrackedSo',
                defaultMessage:
                  '{sku} is not lot tracked, so it cannot be issued by lot',
              },
              { sku: line.sku },
            ),
          );
        }
      }

      /**
       * Components a customer has been promised are not raw material
       * (ADR-045). Checked in product order, so the product locks cannot
       * deadlock with a shipment taking the same ones.
       */
      const committed = inVariantOrder(
        issued.filter((line) => line.supplyType === 'stocked'),
        (line) => line.componentVariantId,
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
       * The licence, snapshotted alongside the lines (ADR-040): by id, and
       * as text, so a finished batch keeps what it was made under even if
       * the licence row is later corrected. With it, its state at this
       * moment and any override (ADR-050) — a fact about the release that
       * has to read the same next year, so stored rather than derived.
       */
      const licence = licenceCheck.licence;

      await tx
        .update(productionOrders)
        .set({
          status: 'released',
          licenceId: licence?.id ?? null,
          licenceNumber: licence?.number ?? null,
          licenceAuthority: licence?.authority ?? null,
          ...licenceAtRelease,
        })
        .where(eq(productionOrders.id, runId));

      /**
       * That an override happened, and against what — not why. The reason
       * stays on the run (ADR-018): free text has no place in a payload
       * kept for two years.
       */
      if (licenceAtRelease.licenceOverriddenBy) {
        recordContext({
          licenceStatus: licenceAtRelease.licenceStatusAtRelease,
          licenceOverridden: true,
        });
      }

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
      const run = await loadWithin(tx, organizationId, runId);

      assertStatus(run.status, 'released', 'credited with output');

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
        t(
          {
            id: 'production.lotsChosenSkuAdd',
            defaultMessage:
              'The lots chosen for {sku} add up to {total}, but the run needs {quantityPlanned}',
          },
          {
            sku: line.sku,
            total: check.total,
            quantityPlanned: line.quantityPlanned,
          },
        ),
      );
    }

    return picked;
  }
}
