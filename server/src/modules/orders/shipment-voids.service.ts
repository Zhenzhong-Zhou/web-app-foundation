import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  invoices,
  orders,
  shipments,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { StockService } from '../stock/stock.service';
import type { VoidShipmentDto } from './dto/void-shipment.dto';
import { loadOrder } from './load-order';

/**
 * Voiding a shipment recorded before the box left (ADR-041, ADR-046).
 *
 * Its own service because voiding shares nothing with shipping but the
 * ledger and the order lookup: it reverses the shipment's own movements
 * rather than choosing lots, and answers to invoices and returns, which
 * shipping never checks.
 */
@Injectable()
export class ShipmentVoidsService {
  private readonly logger = new Logger(ShipmentVoidsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

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
   *
   * Refused while an invoice stands on the shipment; allowed on a closed
   * order, which it reopens (ADR-046).
   */
  async void(
    orderId: string,
    shipmentId: string,
    input: VoidShipmentDto,
    actorId: string,
  ): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);

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
       * Refused while an invoice stands on it (ADR-046, amending ADR-041).
       * Read after the shipment's lock: drafting an invoice holds a share
       * lock on the shipment, so this waits for it and then sees it. A draft
       * is deleted first and an issued invoice voided first, so what is
       * billed and what left never disagree.
       */
      const [standing] = await tx
        .select({ number: invoices.number })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.shipmentId, shipmentId),
            ne(invoices.status, 'voided'),
          ),
        );

      if (standing) {
        throw new ConflictException(
          standing.number
            ? `This shipment is billed on ${standing.number} — void the invoice first`
            : 'This shipment has a draft invoice — delete it first',
        );
      }

      /**
       * Confirmed or closed. A closed order is reopened below: it was closed
       * on the understanding that its goods had left, and they had not.
       */
      if (order.status !== 'confirmed' && order.status !== 'fulfilled') {
        throw new ConflictException(
          `A ${order.status} order has no shipments to void`,
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

      // Part of the same transaction and the same audit row as the void.
      const reopened = order.status === 'fulfilled';

      if (reopened) {
        await tx
          .update(orders)
          .set({ status: 'confirmed' })
          .where(
            and(
              eq(orders.organizationId, organizationId),
              eq(orders.id, orderId),
            ),
          );
      }

      // What was put back, for History. The reason stays on the shipment row
      // rather than in the audit payload: free text is kept out of a two-year
      // table (ADR-018).
      recordContext({
        items: moved
          .map((movement) => `${movement.sku} ${movement.quantity}`)
          .join(', '),
        ...(reopened ? { reopened: true } : {}),
      });

      this.logger.log(`Order ${orderId} shipment ${shipmentId} voided`);
    });
  }
}
