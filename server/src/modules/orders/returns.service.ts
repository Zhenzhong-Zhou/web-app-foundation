import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  orderLines,
  orderReturns,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { ReturnAuthorizationReceiptsService } from '../return-authorizations/return-authorization-receipts.service';
import { inVariantOrder } from '../stock/availability';
import { StockService, type Tx } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { ReturnOrderDto } from './dto/return-order.dto';
import { loadOrder } from './load-order';
import { withLotItems } from './lot-items';
import { lineFor, type OrderLine, requestedLines } from './order-line-lookup';

type ReturnLine = ReturnOrderDto['lines'][number];

/** One lot of one line, as it can still come back. */
export interface ReturnableLot {
  lotId: string;
  code: string;
  expiresAt: string | null;
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
    private readonly rmas: ReturnAuthorizationReceiptsService,
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

      const lines = await requestedLines(tx, organizationId, orderId, ids);
      const tracked = await trackedVariants(
        tx,
        organizationId,
        lines.map((line) => line.variantId),
      );

      /**
       * Held to the RMA it names, if it names one (ADR-047). Locked before
       * anything is written, so two boxes received against one RMA at once
       * queue on it rather than both passing the limit.
       */
      const authorization = input.returnAuthorizationId
        ? await this.rmas.lockForReceipt(
            tx,
            organizationId,
            orderId,
            input.returnAuthorizationId,
          )
        : null;

      const [header] = await tx
        .insert(orderReturns)
        .values({
          organizationId,
          orderId,
          toLocationId: input.toLocationId,
          returnAuthorizationId: authorization?.rma.id ?? null,
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
      const ordered = inVariantOrder(
        input.lines,
        (requested) => lineFor(lines, requested.lineId).variantId,
      );

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

        if (authorization) {
          await this.rmas.assertWithinAuthorized(
            tx,
            authorization,
            line.variantId,
            line.sku,
            total,
          );
        }

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

        /**
         * Shaped like ship()'s counter update, and kept apart on purpose:
         * the two are held to different limits by different constraints —
         * this one to what shipped, shipping's to what was ordered — and
         * each refusal names its own limit.
         */
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
              t(
                {
                  id: 'orders.moreSkuThanWas2',
                  defaultMessage:
                    'That is more {sku} than was shipped. {quantityFulfilled} shipped, {quantityReturned} already returned.',
                },
                {
                  sku: line.sku,
                  quantityFulfilled: line.quantityFulfilled,
                  quantityReturned: line.quantityReturned,
                },
              ),
            );
          }
          throw error;
        }

        summary.push(`${line.sku} ${total}`);
      }

      recordContext({
        items: summary.join(', '),
        ...(authorization
          ? { returnAuthorization: authorization.rma.number }
          : {}),
      });

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

      return withLotItems(tx, organizationId, headers, {
        referenceType: 'order_return',
        reason: 'return',
      });
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
    const order = await loadOrder(tx, organizationId, orderId);

    if (order.direction !== 'sale') {
      throw new BadRequestException(
        t({
          id: 'orders.salesOrderTakesReturns',
          defaultMessage:
            'Only a sales order takes returns. Goods sent back to a supplier are an adjustment.',
        }),
      );
    }

    if (order.status !== 'confirmed' && order.status !== 'fulfilled') {
      throw new ConflictException(
        t(
          {
            id: 'orders.statusOrderShippedNothing',
            defaultMessage: 'A {status} order has shipped nothing to return',
          },
          { status: order.status },
        ),
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
        t(
          {
            id: 'orders.skuTrackedLotSend',
            defaultMessage:
              '{sku} is tracked by lot: send the lots that came back, not a quantity',
          },
          { sku: line.sku },
        ),
      );
    }

    const lotIds = requested.lots.map((lot) => lot.lotId);

    if (new Set(lotIds).size !== lotIds.length) {
      throw new BadRequestException(
        t(
          {
            id: 'orders.lotAppearsTwiceSku',
            defaultMessage:
              'A lot appears twice for {sku} — send its total once',
          },
          { sku: line.sku },
        ),
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
          t(
            {
              id: 'orders.lotCodeSkuNever',
              defaultMessage:
                'Lot {code} of {sku} never shipped on this order, so it cannot come back against it',
            },
            { code: row.code, sku: line.sku },
          ),
        );
      }

      if (row.exceeds) {
        throw new ConflictException(
          t(
            {
              id: 'orders.moreLotCodeThan',
              defaultMessage:
                'More of lot {code} than was shipped. {shipped} shipped, {returned} already returned.',
            },
            { code: row.code, shipped: row.shipped, returned: row.returned },
          ),
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
        t(
          {
            id: 'orders.skuTrackedLotSend2',
            defaultMessage:
              '{sku} is not tracked by lot: send a quantity, not lots',
          },
          { sku: line.sku },
        ),
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
      expires_at: string | null;
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
}
