import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  orderLines,
  orders,
  shipments,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { assertTakeable } from '../stock/availability';
import {
  allocateFefo,
  assertPickedTotal,
  type LotCandidate,
  lotCandidates,
} from '../stock/lot-allocation';
import { StockService, type Tx } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { PreviewShipmentDto, ShipOrderDto } from './dto/ship-order.dto';
import type { VoidShipmentDto } from './dto/void-shipment.dto';
import { lineFor, type OrderLine, requestedLines } from './order-line-lookup';

/** One SKU and lot within a shipment, as the ledger records it. */
interface ShipmentItem {
  shipmentId: string;
  sku: string;
  /** From the catalogue: for the person unpacking, beside the snapshot SKU. */
  description: string;
  unitOfMeasure: string;
  /** Null for untracked stock, which ships without a lot. */
  lotCode: string | null;
  expiresAt: Date | null;
  quantity: string;
}

/** An item as the API returns it: which shipment it belongs to is implied. */
function publicItem(item: ShipmentItem) {
  return {
    sku: item.sku,
    description: item.description,
    unitOfMeasure: item.unitOfMeasure,
    lotCode: item.lotCode,
    expiresAt: item.expiresAt,
    quantity: item.quantity,
  };
}

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
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

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

      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          'A line appears twice in one shipment — send its total once',
        );
      }

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
      const ordered = [...input.lines].sort((a, b) => {
        const left = lineFor(lines, a.lineId).variantId;
        const right = lineFor(lines, b.lineId).variantId;
        return left < right ? -1 : left > right ? 1 : 0;
      });

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

  /**
   * Undoes a shipment recorded before the box left (ADR-041).
   *
   * Nothing is deleted. Each `shipment` movement gets a matching `adjustment`
   * back into the bin it left, referencing the same shipment and carrying the
   * reason, so the ledger shows both what was recorded and its correction.
   * The lines' fulfilled quantities drop by the same amounts, which is also
   * what gives the order its holds back — they are computed from what is
   * outstanding (ADR-045). The shipment row is marked voided and kept.
   *
   * An adjustment rather than a new reason: it is exactly "a person saying the
   * system is wrong", and a new reason would widen a check constraint every
   * reader of the ledger would then have to learn.
   *
   * Refused once anything on it has come back. Goods that were returned did
   * leave, so the shipment is true, and voiding it would leave the order
   * saying more came back than went out.
   */
  async void(
    orderId: string,
    shipmentId: string,
    input: VoidShipmentDto,
    actorId: string,
  ): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.organizationId, organizationId),
          ),
        );

      if (!order) throw new NotFoundException('No such order');

      /**
       * Locked, so two people voiding the same shipment at once cannot both
       * pass the check below and reverse it twice.
       */
      const [shipment] = await tx
        .select()
        .from(shipments)
        .where(
          and(
            eq(shipments.organizationId, organizationId),
            eq(shipments.orderId, orderId),
            eq(shipments.id, shipmentId),
          ),
        )
        .for('update');

      if (!shipment) {
        throw new NotFoundException('No such shipment on this order');
      }

      /**
       * Confirmed only. A closed order is a finished document (ADR-023), and
       * reopening it by the back door is what this must not become.
       */
      if (order.status !== 'confirmed') {
        throw new ConflictException(
          `A ${order.status} order is closed, so its shipments can no longer be voided`,
        );
      }

      if (shipment.voidedAt) {
        throw new ConflictException('That shipment has already been voided');
      }

      /**
       * Per lot, for what this shipment carried: everything returned on the
       * order must still be covered by what its other standing shipments
       * sent. Untracked items have no lot to compare, and are held to the
       * same rule by order_lines_returned_within_fulfilled_check below.
       */
      const [returned] = (
        await tx.execute(sql`
          with carried as (
            select distinct variant_id, lot_id, sku
            from stock_movements
            where organization_id = ${organizationId}::uuid
              and reference_type = 'shipment'
              and reference_id = ${shipmentId}::uuid
              and reason = 'shipment'
              and lot_id is not null
          ),
          still_shipped as (
            select variant_id, lot_id, sum(quantity) as quantity
            from stock_movements
            where organization_id = ${organizationId}::uuid
              and reason = 'shipment'
              and reference_type = 'shipment'
              and reference_id in (
                select id from shipments
                where organization_id = ${organizationId}::uuid
                  and order_id = ${orderId}::uuid
                  and id <> ${shipmentId}::uuid
                  and voided_at is null
              )
            group by variant_id, lot_id
          ),
          came_back as (
            select variant_id, lot_id, sum(quantity) as quantity
            from stock_movements
            where organization_id = ${organizationId}::uuid
              and reason = 'return'
              and reference_type = 'order_return'
              and reference_id in (
                select id from order_returns
                where organization_id = ${organizationId}::uuid
                  and order_id = ${orderId}::uuid
              )
            group by variant_id, lot_id
          )
          select c.sku, l.code
          from carried c
          join came_back r using (variant_id, lot_id)
          left join still_shipped o using (variant_id, lot_id)
          join lots l on l.id = c.lot_id
          where r.quantity > coalesce(o.quantity, 0)
          limit 1
        `)
      ).rows as { sku: string; code: string }[];

      if (returned) {
        throw new ConflictException(
          `${returned.sku} lot ${returned.code} from this shipment has already been returned — it did leave, so the shipment cannot be voided`,
        );
      }

      /**
       * In variant order, the rule ship follows, so a void and a shipment
       * touching the same products cannot take their locks in opposite
       * orders and deadlock.
       */
      const moved = await tx
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.organizationId, organizationId),
            eq(stockMovements.referenceType, 'shipment'),
            eq(stockMovements.referenceId, shipmentId),
            eq(stockMovements.reason, 'shipment'),
          ),
        )
        .orderBy(asc(stockMovements.variantId), asc(stockMovements.id));

      for (const movement of moved) {
        await this.stock.recordWithin(
          tx,
          organizationId,
          {
            variantId: movement.variantId,
            lotId: movement.lotId,
            toLocationId: movement.fromLocationId ?? shipment.fromLocationId,
            quantity: movement.quantity,
            reason: 'adjustment',
            reasonDetail: 'shipment voided',
            referenceType: 'shipment',
            referenceId: shipmentId,
            note: input.reason,
          },
          actorId,
        );
      }

      try {
        // Summed in SQL per item, never in JS (ADR-025). An order has one
        // line per variant, so the variant finds the line.
        await tx.execute(sql`
          update order_lines ol
          set quantity_fulfilled = ol.quantity_fulfilled - s.quantity
          from (
            select variant_id, sum(quantity) as quantity
            from stock_movements
            where organization_id = ${organizationId}::uuid
              and reference_type = 'shipment'
              and reference_id = ${shipmentId}::uuid
              and reason = 'shipment'
            group by variant_id
          ) s
          where ol.organization_id = ${organizationId}::uuid
            and ol.order_id = ${orderId}::uuid
            and ol.variant_id = s.variant_id
        `);
      } catch (error) {
        if (
          isCheckViolation(error, 'order_lines_returned_within_fulfilled_check')
        ) {
          throw new ConflictException(
            'Part of this shipment has already been returned — it did leave, so the shipment cannot be voided',
          );
        }
        throw error;
      }

      await tx
        .update(shipments)
        .set({
          voidedAt: new Date(),
          voidedBy: actorId,
          voidReason: input.reason,
        })
        .where(eq(shipments.id, shipmentId));

      // What was put back, for History. The reason stays on the shipment row
      // rather than in the audit payload: free text is kept out of a two-year
      // table (ADR-018).
      recordContext({
        items: moved
          .map((movement) => `${movement.sku} ${movement.quantity}`)
          .join(', '),
      });

      this.logger.log(`Order ${orderId} shipment ${shipmentId} voided`);
    });
  }

  /**
   * An order's shipments, newest first, each with what it carried by lot.
   * Read from the ledger: the movements are the record, the shipment row is
   * only the header they hang from.
   */
  async listForOrder(orderId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const headers = await tx
        .select()
        .from(shipments)
        .where(
          and(
            eq(shipments.organizationId, organizationId),
            eq(shipments.orderId, orderId),
          ),
        )
        .orderBy(desc(shipments.createdAt));

      if (headers.length === 0) return [];

      const items = await this.itemsOf(
        tx,
        organizationId,
        headers.map((header) => header.id),
      );

      return headers.map((header) => ({
        ...header,
        items: items
          .filter((item) => item.shipmentId === header.id)
          .map(publicItem),
      }));
    });
  }

  /**
   * Everything a packing slip prints, in one read: the shipment and what it
   * carried, the order's reference and customer, where it was going, and who
   * sent it.
   *
   * The address is the order's snapshot, not the partner's address as it is
   * today (ADR-035's neighbour, migration 0012): a slip reprinted next year
   * must show where the box actually went. The item names are joined from the
   * catalogue, which is right for a slip — it is read by a person unpacking a
   * box, not kept as a record — while the SKU beside them is the snapshot.
   */
  async slip(orderId: string, shipmentId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = (
        await tx.execute(sql`
          select
            s.id,
            s.created_at,
            s.carrier,
            s.tracking_number,
            s.note,
            s.voided_at,
            s.void_reason,
            o.reference,
            o.direction,
            o.ship_to_label,
            o.ship_to_line1,
            o.ship_to_line2,
            o.ship_to_city,
            o.ship_to_region,
            o.ship_to_postal_code,
            o.ship_to_country,
            p.name as partner_name,
            org.name as organization_name,
            loc.name as from_location_name
          from shipments s
          join orders o on o.id = s.order_id
          join partners p on p.id = o.partner_id
          join organizations org on org.id = s.organization_id
          join locations loc on loc.id = s.from_location_id
          where s.organization_id = ${organizationId}::uuid
            and s.order_id = ${orderId}::uuid
            and s.id = ${shipmentId}::uuid
        `)
      ).rows as {
        id: string;
        created_at: Date;
        carrier: string | null;
        tracking_number: string | null;
        note: string | null;
        voided_at: Date | null;
        void_reason: string | null;
        reference: string | null;
        direction: string;
        ship_to_label: string | null;
        ship_to_line1: string | null;
        ship_to_line2: string | null;
        ship_to_city: string | null;
        ship_to_region: string | null;
        ship_to_postal_code: string | null;
        ship_to_country: string | null;
        partner_name: string;
        organization_name: string;
        from_location_name: string;
      }[];

      if (!row) throw new NotFoundException('No such shipment on this order');

      const items = await this.itemsOf(tx, organizationId, [shipmentId]);

      return {
        id: row.id,
        createdAt: row.created_at,
        carrier: row.carrier,
        trackingNumber: row.tracking_number,
        note: row.note,
        // A voided slip still prints, marked as such, so a copy found in a
        // drawer later cannot pass for goods that left.
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
        fromLocationName: row.from_location_name,
        organizationName: row.organization_name,
        order: {
          id: orderId,
          reference: row.reference,
          partnerName: row.partner_name,
        },
        // Null when the order was raised without a destination: a slip then
        // prints the customer's name alone rather than an empty address box.
        shipTo: row.ship_to_line1
          ? {
              label: row.ship_to_label,
              line1: row.ship_to_line1,
              line2: row.ship_to_line2,
              city: row.ship_to_city,
              region: row.ship_to_region,
              postalCode: row.ship_to_postal_code,
              country: row.ship_to_country,
            }
          : null,
        items: items.map(publicItem),
      };
    });
  }

  /**
   * What some shipments carried, one row per SKU and lot. Shared by the list
   * and the slip so the two cannot disagree about a shipment's contents. A
   * voided shipment still lists what it carried: that is what was on the slip
   * that was voided.
   */
  private async itemsOf(
    tx: Tx,
    organizationId: string,
    shipmentIds: string[],
  ): Promise<ShipmentItem[]> {
    const moved = await tx.execute(sql`
      select
        sm.reference_id as shipment_id,
        sm.sku,
        pr.name as product_name,
        pv.name as variant_name,
        pv.unit_of_measure,
        l.code as lot_code,
        l.expires_at,
        sum(sm.quantity)::text as quantity
      from stock_movements sm
      join product_variants pv on pv.id = sm.variant_id
      join products pr on pr.id = pv.product_id
      left join lots l on l.id = sm.lot_id
      where sm.organization_id = ${organizationId}::uuid
        and sm.reference_type = 'shipment'
        -- The shipment's own movements. A void's adjustments reference the
        -- same shipment, and counting them would double what it carried.
        and sm.reason = 'shipment'
        and sm.reference_id in (${sql.join(
          shipmentIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      group by sm.reference_id, sm.sku, pr.name, pv.name, pv.unit_of_measure,
        l.code, l.expires_at
      order by sm.sku, l.expires_at asc nulls last, l.code
    `);

    return (
      moved.rows as {
        shipment_id: string;
        sku: string;
        product_name: string;
        variant_name: string | null;
        unit_of_measure: string;
        lot_code: string | null;
        expires_at: Date | null;
        quantity: string;
      }[]
    ).map((row) => ({
      shipmentId: row.shipment_id,
      sku: row.sku,
      description: row.variant_name
        ? `${row.product_name} (${row.variant_name})`
        : row.product_name,
      unitOfMeasure: row.unit_of_measure,
      lotCode: row.lot_code,
      expiresAt: row.expires_at,
      quantity: row.quantity,
    }));
  }

  // ---------------------------------------------------------------------------

  private async loadShippable(tx: Tx, organizationId: string, orderId: string) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
      );

    if (!order) throw new NotFoundException('No such order');

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
