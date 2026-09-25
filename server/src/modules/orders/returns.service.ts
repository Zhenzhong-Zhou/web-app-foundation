import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  orderLines,
  orderReturns,
  orders,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { itemName } from '../stock/item-name';
import { StockService, type Tx } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { ReturnOrderDto } from './dto/return-order.dto';
import { lineFor, type OrderLine, requestedLines } from './order-line-lookup';

type ReturnLine = ReturnOrderDto['lines'][number];

/** One lot of one line, as it can still come back. */
export interface ReturnableLot {
  lotId: string;
  code: string;
  expiresAt: Date | null;
  shipped: string;
  returned: string;
}

/** One order line, with what shipped and what has already come back. */
export interface ReturnableLine {
  lineId: string;
  sku: string;
  unitOfMeasure: string;
  tracksLots: boolean;
  quantityFulfilled: string;
  quantityReturned: string;
  /** Only lots that actually shipped on this order; empty when untracked. */
  lots: ReturnableLot[];
}

/** An item as a return's list shows it. */
interface ReturnItem {
  returnId: string;
  sku: string;
  description: string;
  unitOfMeasure: string;
  lotCode: string | null;
  expiresAt: Date | null;
  quantity: string;
}

/**
 * Customer returns against sales orders (ADR-043).
 *
 * A return is the mirror of a shipment, with one rule a shipment does not
 * need: a lot can only come back if it went out on this order, and never more
 * of it than went. A customer cannot return what they were never sent, and
 * letting them would put a lot into the recall trail against an order it never
 * touched.
 *
 * Shipped stays as it was. `quantity_returned` rises beside it, because
 * lowering "shipped" would erase the fact that it shipped — which is the
 * history a recall reads.
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  /**
   * What can still come back: each shipped line, and for tracked stock each
   * lot that shipped on this order with how much of it has returned. The
   * return dialog is built from this, so it offers exactly what the server
   * will accept.
   */
  async returnable(orderId: string): Promise<ReturnableLine[]> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.loadReturnable(tx, organizationId, orderId);

      const lines = await tx
        .select({
          line: orderLines,
          unitOfMeasure: productVariants.unitOfMeasure,
          tracksLots: productVariants.tracksLots,
        })
        .from(orderLines)
        .innerJoin(
          productVariants,
          eq(productVariants.id, orderLines.variantId),
        )
        .where(
          and(
            eq(orderLines.organizationId, organizationId),
            eq(orderLines.orderId, orderId),
            sql`${orderLines.quantityFulfilled} > 0`,
          ),
        );

      const byLot = await this.lotBalances(tx, organizationId, orderId);

      return lines.map(({ line, unitOfMeasure, tracksLots }) => ({
        lineId: line.id,
        sku: line.sku,
        unitOfMeasure,
        tracksLots,
        quantityFulfilled: line.quantityFulfilled,
        quantityReturned: line.quantityReturned,
        lots: tracksLots
          ? byLot
              .filter((row) => row.variantId === line.variantId)
              .map((lot) => ({
                lotId: lot.lotId,
                code: lot.code,
                expiresAt: lot.expiresAt,
                shipped: lot.shipped,
                returned: lot.returned,
              }))
          : [],
      }));
    });
  }

  async receive(orderId: string, input: ReturnOrderDto, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await this.loadReturnable(tx, organizationId, orderId);

      const ids = input.lines.map((line) => line.lineId);

      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          'A line appears twice in one return — send its total once',
        );
      }

      const lines = await requestedLines(tx, organizationId, orderId, ids);
      const tracked = await trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.variantId),
      );

      const [header] = await tx
        .insert(orderReturns)
        .values({
          organizationId,
          orderId,
          toLocationId: input.toLocationId,
          reason: input.reason,
          note: input.note,
          createdBy: actorId,
        })
        .returning();

      /**
       * Variant order, as shipping does: two returns touching the same
       * products take their row locks in one global order and cannot
       * deadlock (ADR-023).
       */
      const ordered = [...input.lines].sort((a, b) => {
        const left = lineFor(lines, a.lineId).variantId;
        const right = lineFor(lines, b.lineId).variantId;
        return left < right ? -1 : left > right ? 1 : 0;
      });

      const summary: string[] = [];

      for (const requested of ordered) {
        const line = lineFor(lines, requested.lineId);

        const { total, parts } = tracked.has(line.variantId)
          ? await this.trackedParts(
              tx,
              organizationId,
              orderId,
              line,
              requested,
            )
          : this.untrackedParts(line, requested);

        for (const part of parts) {
          await this.stock.recordWithin(
            tx,
            organizationId,
            {
              variantId: line.variantId,
              lotId: part.lotId,
              toLocationId: input.toLocationId,
              quantity: part.quantity,
              reason: 'return',
              reasonDetail: input.reason,
              referenceType: 'order_return',
              referenceId: header.id,
              note: input.note,
            },
            actorId,
          );
        }

        try {
          await tx
            .update(orderLines)
            .set({
              quantityReturned: sql`${orderLines.quantityReturned} + ${total}::numeric`,
            })
            .where(eq(orderLines.id, line.id));
        } catch (error) {
          if (
            isCheckViolation(
              error,
              'order_lines_returned_within_fulfilled_check',
            )
          ) {
            throw new ConflictException(
              `That is more ${line.sku} than was shipped. ${line.quantityFulfilled} shipped, ${line.quantityReturned} already returned.`,
            );
          }
          throw error;
        }

        summary.push(`${line.sku} ${total}`);
      }

      recordContext({ items: summary.join(', ') });

      this.logger.log(
        `Order ${orderId} received a return of ${input.lines.length} lines as ${header.id}`,
      );

      return header;
    });
  }

  /** An order's returns, newest first, each with what came back by lot. */
  async listForOrder(orderId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const headers = await tx
        .select()
        .from(orderReturns)
        .where(
          and(
            eq(orderReturns.organizationId, organizationId),
            eq(orderReturns.orderId, orderId),
          ),
        )
        .orderBy(desc(orderReturns.createdAt));

      if (headers.length === 0) return [];

      const items = await this.itemsOf(
        tx,
        organizationId,
        headers.map((header) => header.id),
      );

      return headers.map((header) => ({
        ...header,
        items: items
          .filter((item) => item.returnId === header.id)
          .map((item) => ({
            sku: item.sku,
            description: item.description,
            unitOfMeasure: item.unitOfMeasure,
            lotCode: item.lotCode,
            expiresAt: item.expiresAt,
            quantity: item.quantity,
          })),
      }));
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Sales only, and only once something could have shipped: confirmed, or
   * fulfilled — a return most often arrives after the order is done.
   */
  private async loadReturnable(
    tx: Tx,
    organizationId: string,
    orderId: string,
  ) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
      );

    if (!order) throw new NotFoundException('No such order');

    if (order.direction !== 'sale') {
      throw new BadRequestException(
        'Only a sales order takes returns. Goods sent back to a supplier are an adjustment.',
      );
    }

    if (order.status !== 'confirmed' && order.status !== 'fulfilled') {
      throw new ConflictException(
        `A ${order.status} order has shipped nothing to return`,
      );
    }

    return order;
  }

  /**
   * A tracked line's lots, checked against what shipped on this order.
   *
   * Every lot must have gone out on this order for this item, and never more
   * of it may come back than went. The total is summed in SQL, so the client
   * never adds up decimals (ADR-025).
   */
  private async trackedParts(
    tx: Tx,
    organizationId: string,
    orderId: string,
    line: OrderLine,
    requested: ReturnLine,
  ): Promise<{ total: string; parts: { lotId: string; quantity: string }[] }> {
    if (!requested.lots || requested.quantity) {
      throw new BadRequestException(
        `${line.sku} is tracked by lot: send the lots that came back, not a quantity`,
      );
    }

    const lotIds = requested.lots.map((lot) => lot.lotId);

    if (new Set(lotIds).size !== lotIds.length) {
      throw new BadRequestException(
        `A lot appears twice for ${line.sku} — send its total once`,
      );
    }

    const picked = sql.join(
      requested.lots.map(
        (lot) => sql`(${lot.lotId}::uuid, ${lot.quantity}::numeric)`,
      ),
      sql`, `,
    );

    const checked = (
      await tx.execute(sql`
        with picked(lot_id, quantity) as (values ${picked}),
        balances as (${this.balancesSql(organizationId, orderId, line.variantId)})
        select
          p.lot_id,
          coalesce(l.code, p.lot_id::text) as code,
          b.lot_id is null as never_shipped,
          coalesce(b.shipped, 0) - coalesce(b.returned, 0) < p.quantity as exceeds,
          coalesce(b.shipped, 0)::text as shipped,
          coalesce(b.returned, 0)::text as returned,
          sum(p.quantity) over ()::text as total
        from picked p
        left join balances b on b.lot_id = p.lot_id
        left join lots l on l.id = p.lot_id and l.organization_id = ${organizationId}::uuid
      `)
    ).rows as {
      lot_id: string;
      code: string;
      never_shipped: boolean;
      exceeds: boolean;
      shipped: string;
      returned: string;
      total: string;
    }[];

    for (const row of checked) {
      if (row.never_shipped) {
        throw new BadRequestException(
          `Lot ${row.code} of ${line.sku} never shipped on this order, so it cannot come back against it`,
        );
      }

      if (row.exceeds) {
        throw new ConflictException(
          `More of lot ${row.code} than was shipped. ${row.shipped} shipped, ${row.returned} already returned.`,
        );
      }
    }

    return { total: checked[0].total, parts: requested.lots };
  }

  /** Untracked stock has no lots to check, only a total against the line. */
  private untrackedParts(
    line: OrderLine,
    requested: ReturnLine,
  ): { total: string; parts: { lotId: null; quantity: string }[] } {
    if (!requested.quantity || requested.lots) {
      throw new BadRequestException(
        `${line.sku} is not tracked by lot: send a quantity, not lots`,
      );
    }

    return {
      total: requested.quantity,
      parts: [{ lotId: null, quantity: requested.quantity }],
    };
  }

  /**
   * Shipped and returned per lot, for one item or all of them on an order.
   * Read from the ledger through the order's shipments and returns, so it is
   * the movements that decide, not a counter that could drift from them.
   */
  private balancesSql(
    organizationId: string,
    orderId: string,
    variantId?: string,
  ) {
    const variant = variantId
      ? sql`and sm.variant_id = ${variantId}::uuid`
      : sql``;

    return sql`
      select
        sm.variant_id,
        sm.lot_id,
        sum(sm.quantity) filter (where sm.reason = 'shipment') as shipped,
        sum(sm.quantity) filter (where sm.reason = 'return') as returned
      from stock_movements sm
      where sm.organization_id = ${organizationId}::uuid
        and sm.lot_id is not null
        ${variant}
        and (
          (sm.reference_type = 'shipment' and sm.reference_id in (
            select id from shipments
            where organization_id = ${organizationId}::uuid
              and order_id = ${orderId}::uuid
              -- A voided shipment never left (ADR-041), so nothing on it
              -- can come back.
              and voided_at is null
          ))
          or
          (sm.reference_type = 'order_return' and sm.reference_id in (
            select id from order_returns
            where organization_id = ${organizationId}::uuid
              and order_id = ${orderId}::uuid
          ))
        )
      group by sm.variant_id, sm.lot_id
      having sum(sm.quantity) filter (where sm.reason = 'shipment') > 0
    `;
  }

  private async lotBalances(tx: Tx, organizationId: string, orderId: string) {
    const rows = (
      await tx.execute(sql`
        select
          b.variant_id,
          b.lot_id,
          l.code,
          l.expires_at,
          b.shipped::text as shipped,
          coalesce(b.returned, 0)::text as returned
        from (${this.balancesSql(organizationId, orderId)}) b
        join lots l on l.id = b.lot_id
        order by l.expires_at asc nulls last, l.code
      `)
    ).rows as {
      variant_id: string;
      lot_id: string;
      code: string;
      expires_at: Date | null;
      shipped: string;
      returned: string;
    }[];

    return rows.map((row) => ({
      variantId: row.variant_id,
      lotId: row.lot_id,
      code: row.code,
      expiresAt: row.expires_at,
      shipped: row.shipped,
      returned: row.returned,
    }));
  }

  private async itemsOf(
    tx: Tx,
    organizationId: string,
    returnIds: string[],
  ): Promise<ReturnItem[]> {
    const rows = (
      await tx.execute(sql`
        select
          sm.reference_id as return_id,
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
          and sm.reference_type = 'order_return'
          and sm.reference_id in (${sql.join(
            returnIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
        group by sm.reference_id, sm.sku, pr.name, pv.name, pv.unit_of_measure,
          l.code, l.expires_at
        order by sm.sku, l.expires_at asc nulls last, l.code
      `)
    ).rows as {
      return_id: string;
      sku: string;
      product_name: string;
      variant_name: string | null;
      unit_of_measure: string;
      lot_code: string | null;
      expires_at: Date | null;
      quantity: string;
    }[];

    return rows.map((row) => ({
      returnId: row.return_id,
      sku: row.sku,
      description: itemName(row.product_name, row.variant_name),
      unitOfMeasure: row.unit_of_measure,
      lotCode: row.lot_code,
      expiresAt: row.expires_at,
      quantity: row.quantity,
    }));
  }
}
