import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import { orderLines, shipments } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { assertTakeable, inVariantOrder } from '../stock/availability';
import {
  allocateFefo,
  assertPickedTotal,
  type LotCandidate,
  lotCandidates,
} from '../stock/lot-allocation';
import { StockService, type Tx } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { PreviewShipmentDto, ShipOrderDto } from './dto/ship-order.dto';
import { loadOrder } from './load-order';
import { lineFor, type OrderLine, requestedLines } from './order-line-lookup';

/** One line as a shipment would send it, lots included (ADR-041). */
export interface ShipmentPlanLine {
  lineId: string;
  sku: string;
  quantity: string;
  tracksLots: boolean;
  /** Candidates at the source, earliest expiry first; empty if untracked. */
  lots: LotCandidate[];
  /** What the source is missing for this line, or null if it can cover it. */
  shortBy: string | null;
  /** More than the line still has outstanding — the ship would be refused. */
  exceedsOutstanding: boolean;
}

/**
 * Shipping against sales orders (ADR-041).
 *
 * A shipment is one transaction: every line in it moves, or none does. A
 * box that could only be half packed is not a shipment to record as sent, and
 * a record that says otherwise is the one a customer disputes.
 *
 * Stock leaves by the ADR-039 rule — earliest expiry first, oldest first where
 * nothing expires — one `shipment` movement per lot, each referencing the
 * shipment. That is forward traceability: from a lot, every customer who
 * received it, read straight from the ledger.
 */
@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  /**
   * What a shipment would take, line by line, without moving anything.
   *
   * Advice rather than a reservation: stock can move between this and the
   * ship, and ship recomputes against the shelf as it is then.
   */
  async preview(orderId: string, input: PreviewShipmentDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.loadShippable(tx, organizationId, orderId);

      const lines = await requestedLines(
        tx,
        organizationId,
        orderId,
        input.lines.map((line) => line.lineId),
      );

      const tracked = await trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.variantId),
      );

      const plan: ShipmentPlanLine[] = [];

      for (const requested of input.lines) {
        const line = lineFor(lines, requested.lineId);
        const tracksLots = tracked.has(line.variantId);

        const [outstanding] = (
          await tx.execute(sql`
            select (${line.quantityOrdered}::numeric - ${line.quantityFulfilled}::numeric)
              < ${requested.quantity}::numeric as exceeds
          `)
        ).rows as { exceeds: boolean }[];

        const entry: ShipmentPlanLine = {
          lineId: line.id,
          sku: line.sku,
          quantity: requested.quantity,
          tracksLots,
          lots: [],
          shortBy: null,
          exceedsOutstanding: outstanding.exceeds,
        };

        if (tracksLots) {
          const { candidates, shortBy } = await lotCandidates(tx, {
            organizationId,
            variantId: line.variantId,
            locationId: input.fromLocationId,
            quantity: requested.quantity,
          });

          entry.lots = candidates;
          entry.shortBy = shortBy;
        } else {
          entry.shortBy = await this.untrackedShortBy(
            tx,
            organizationId,
            line.variantId,
            input.fromLocationId,
            requested.quantity,
          );
        }

        plan.push(entry);
      }

      return { lines: plan };
    });
  }

  async ship(orderId: string, input: ShipOrderDto, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.loadShippable(tx, organizationId, orderId);

      const ids = input.lines.map((line) => line.lineId);

      const lines = await requestedLines(tx, organizationId, orderId, ids);

      for (const line of lines) {
        if (line.isClosedShort) {
          throw new ConflictException(
            `${line.sku} was closed short, so nothing more ships against it`,
          );
        }
      }

      const tracked = await trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.variantId),
      );

      const [shipment] = await tx
        .insert(shipments)
        .values({
          organizationId,
          orderId,
          fromLocationId: input.fromLocationId,
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          note: input.note,
          createdBy: actorId,
        })
        .returning();

      /**
       * In variant order, not the order they were sent in. Two shipments
       * touching the same two products in opposite orders would each lock one
       * and wait for the other; taking locks in one global order is the same
       * rule transfers follow (ADR-023).
       */
      const ordered = inVariantOrder(
        input.lines,
        (requested) => lineFor(lines, requested.lineId).variantId,
      );

      for (const requested of ordered) {
        const line = lineFor(lines, requested.lineId);

        /**
         * This order may take its own hold and whatever nobody holds, but
         * not stock promised to another order (ADR-045). Checked here, in
         * variant order, so the product locks it takes cannot deadlock.
         */
        await assertTakeable(tx, {
          organizationId,
          variantId: line.variantId,
          quantity: requested.quantity,
          sku: line.sku,
          forOrderId: orderId,
        });

        const allocations = tracked.has(line.variantId)
          ? await this.lotsToShip(tx, organizationId, line, requested, input)
          : [{ lotId: null, quantity: requested.quantity }];

        for (const allocation of allocations) {
          await this.stock.recordWithin(
            tx,
            organizationId,
            {
              variantId: line.variantId,
              lotId: allocation.lotId,
              fromLocationId: input.fromLocationId,
              quantity: allocation.quantity,
              reason: 'shipment',
              referenceType: 'shipment',
              referenceId: shipment.id,
            },
            actorId,
          );
        }

        /**
         * Shaped like a return's counter update, and kept apart on purpose:
         * the two are held to different limits by different constraints —
         * this one to what was ordered, a return's to what shipped — and
         * each refusal names its own limit.
         */
        try {
          await tx
            .update(orderLines)
            .set({
              quantityFulfilled: sql`${orderLines.quantityFulfilled} + ${requested.quantity}::numeric`,
            })
            .where(eq(orderLines.id, line.id));
        } catch (error) {
          if (
            isCheckViolation(
              error,
              'order_lines_fulfilled_within_ordered_check',
            )
          ) {
            throw new ConflictException(
              `That is more ${line.sku} than was ordered. ${line.quantityOrdered} ordered, ${line.quantityFulfilled} already shipped.`,
            );
          }
          throw error;
        }
      }

      // What left, readable in History without opening the shipment.
      recordContext({
        items: input.lines
          .map(
            (requested) =>
              `${lineFor(lines, requested.lineId).sku} ${requested.quantity}`,
          )
          .join(', '),
      });

      this.logger.log(
        `Order ${orderId} shipped ${input.lines.length} lines as ${shipment.id}`,
      );

      return shipment;
    });
  }

  // ---------------------------------------------------------------------------

  private async loadShippable(tx: Tx, organizationId: string, orderId: string) {
    const order = await loadOrder(tx, organizationId, orderId);

    if (order.direction !== 'sale') {
      throw new BadRequestException(
        'Only a sales order is shipped. A purchase is received.',
      );
    }

    /**
     * Confirmed only, the same rule receiving follows. A draft is not yet a
     * commitment to the customer, and stock leaving against one is a real
     * event that belongs in the ledger as an unreferenced shipment instead.
     */
    if (order.status !== 'confirmed') {
      throw new ConflictException(
        `A ${order.status} order cannot be shipped against`,
      );
    }

    return order;
  }

  /** The person's pick if they made one, otherwise earliest expiry first. */
  private async lotsToShip(
    tx: Tx,
    organizationId: string,
    line: OrderLine,
    requested: ShipOrderDto['lines'][number],
    input: ShipOrderDto,
  ): Promise<{ lotId: string; quantity: string }[]> {
    if (requested.lots) {
      await assertPickedTotal(tx, requested.lots, requested.quantity, line.sku);
      return requested.lots;
    }

    return allocateFefo(tx, {
      organizationId,
      variantId: line.variantId,
      locationId: input.fromLocationId,
      quantity: requested.quantity,
      sku: line.sku,
    });
  }

  /** Untracked stock has no lots to choose between, only a total to cover. */
  private async untrackedShortBy(
    tx: Tx,
    organizationId: string,
    variantId: string,
    locationId: string,
    quantity: string,
  ): Promise<string | null> {
    const [row] = (
      await tx.execute(sql`
        select
          greatest(${quantity}::numeric - coalesce(sum(quantity), 0), 0)::text as short_by,
          coalesce(sum(quantity), 0) < ${quantity}::numeric as short
        from stock_levels
        where organization_id = ${organizationId}::uuid
          and variant_id = ${variantId}::uuid
          and location_id = ${locationId}::uuid
          and lot_id is null
      `)
    ).rows as { short_by: string; short: boolean }[];

    return row.short ? row.short_by : null;
  }
}
