import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  orderLines,
  orders,
  productVariants,
  shipments,
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
import type { PreviewShipmentDto, ShipOrderDto } from './dto/ship-order.dto';

type OrderLine = typeof orderLines.$inferSelect;

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

      const lines = await this.requestedLines(
        tx,
        organizationId,
        orderId,
        input.lines.map((line) => line.lineId),
      );

      const tracked = await this.trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.variantId),
      );

      const plan: ShipmentPlanLine[] = [];

      for (const requested of input.lines) {
        const line = this.lineFor(lines, requested.lineId);
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

      const lines = await this.requestedLines(tx, organizationId, orderId, ids);

      for (const line of lines) {
        if (line.isClosedShort) {
          throw new ConflictException(
            `${line.sku} was closed short, so nothing more ships against it`,
          );
        }
      }

      const tracked = await this.trackedVariants(
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
        const left = this.lineFor(lines, a.lineId).variantId;
        const right = this.lineFor(lines, b.lineId).variantId;
        return left < right ? -1 : left > right ? 1 : 0;
      });

      for (const requested of ordered) {
        const line = this.lineFor(lines, requested.lineId);

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
              `${this.lineFor(lines, requested.lineId).sku} ${requested.quantity}`,
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
   * and the slip so the two cannot disagree about a shipment's contents.
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

  private async requestedLines(
    tx: Tx,
    organizationId: string,
    orderId: string,
    lineIds: string[],
  ): Promise<OrderLine[]> {
    const lines = await tx
      .select()
      .from(orderLines)
      .where(
        and(
          eq(orderLines.organizationId, organizationId),
          eq(orderLines.orderId, orderId),
          inArray(orderLines.id, lineIds),
        ),
      );

    const found = new Set(lines.map((line) => line.id));
    const missing = lineIds.find((id) => !found.has(id));

    if (missing)
      throw new NotFoundException(`No line ${missing} on this order`);

    return lines;
  }

  private lineFor(lines: OrderLine[], lineId: string): OrderLine {
    const line = lines.find((row) => row.id === lineId);
    if (!line) throw new NotFoundException(`No line ${lineId} on this order`);
    return line;
  }

  private async trackedVariants(
    tx: Tx,
    organizationId: string,
    variantIds: string[],
  ): Promise<Set<string>> {
    if (variantIds.length === 0) return new Set();

    const rows = await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          inArray(productVariants.id, variantIds),
          eq(productVariants.tracksLots, true),
        ),
      );

    return new Set(rows.map((row) => row.id));
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
