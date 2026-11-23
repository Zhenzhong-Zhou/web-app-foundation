import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import {
  type LotExpiry,
  orderLines,
  orderReturns,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { ReturnAuthorizationReceiptsService } from '../return-authorizations/return-authorization-receipts.service';
import { inVariantOrder } from '../stock/availability';
import { startLotsOf } from '../stock/start-lot';
import { StockService, type Tx } from '../stock/stock.service';
import { trackedVariants } from '../stock/tracked-variants';
import type { ReturnOrderDto } from './dto/return-order.dto';
import type { OrderReturn } from './dto/shipment-response.dto';
import { loadOrder } from './load-order';
import { withLotItems } from './lot-items';
import { lineFor, type OrderLine, requestedLines } from './order-line-lookup';

type ReturnLine = ReturnOrderDto['lines'][number];

/** One lot of one line, as it can still come back. */
export interface ReturnableLot {
  lotId: string;
  code: string;
  expiresAt: string | null;
  expiry: LotExpiry;
  shipped: string;
  returned: string;
}

/**
 * What of a tracked line shipped with no lot, before its code's lot
 * tracking started, and the lot it goes into when it comes back (ADR-094,
 * Q3a): the code's start lot, or none yet, made then.
 */
export interface ReturnableFromBefore {
  shipped: string;
  returned: string;
  lotId: string | null;
  lotCode: string | null;
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
  /** Null where none shipped so, and for a code not tracked. */
  fromBefore: ReturnableFromBefore | null;
}

/** A part of a line coming back: a lot, or none, as it left. */
interface ReturnPart {
  lotId: string | null;
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
 *
 * A tracked code may have shipped with no lot before its lot tracking
 * started (ADR-094, Q3a). That part comes back by quantity, held to what
 * shipped so, as it left, with no lot, then into the code's start lot, so
 * what each lot shipped and what came back of it still match, and no
 * column says which was which.
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
   * lot that shipped on this order with how much of it has returned, and
   * what shipped with no lot before the code's lot tracking started, with
   * the lot it goes into. The return dialog is built from this, so it
   * offers exactly what the server will accept.
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

      const balances = await this.balances(tx, organizationId, orderId);
      const startLots = await startLotsOf(
        tx,
        organizationId,
        lines.filter((row) => row.tracksLots).map((row) => row.line.variantId),
      );

      return lines.map(({ line, unitOfMeasure, tracksLots }) => {
        const own = tracksLots
          ? balances.filter((row) => row.variantId === line.variantId)
          : [];
        const before = own.find((row) => row.lotId === null);
        const into = startLots.get(line.variantId);

        return {
          lineId: line.id,
          sku: line.sku,
          unitOfMeasure,
          tracksLots,
          quantityFulfilled: line.quantityFulfilled,
          quantityReturned: line.quantityReturned,
          lots: own.flatMap((lot) =>
            lot.lotId === null
              ? []
              : [
                  {
                    lotId: lot.lotId,
                    code: lot.code!,
                    expiresAt: lot.expiresAt,
                    expiry: lot.expiry!,
                    shipped: lot.shipped,
                    returned: lot.returned,
                  },
                ],
          ),
          fromBefore: before
            ? {
                shipped: before.shipped,
                returned: before.returned,
                lotId: into?.id ?? null,
                lotCode: into?.code ?? null,
              }
            : null,
        };
      });
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
              // With no lot, as it left: into the start lot after, where
              // the code tracks lots now (ADR-094, Q3a).
              fromBefore: part.lotId === null,
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
        // A list, which History joins the way its reader's language joins one.
        items: summary,
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
  async listForOrder(orderId: string, locale: Locale): Promise<OrderReturn[]> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      // The fields the API returns (ADR-068), not the row.
      const headers = await tx
        .select({
          id: orderReturns.id,
          toLocationId: orderReturns.toLocationId,
          returnAuthorizationId: orderReturns.returnAuthorizationId,
          reason: orderReturns.reason,
          note: orderReturns.note,
          createdAt: orderReturns.createdAt,
        })
        .from(orderReturns)
        .where(
          and(
            eq(orderReturns.organizationId, organizationId),
            eq(orderReturns.orderId, orderId),
          ),
        )
        .orderBy(desc(orderReturns.createdAt));

      return withLotItems(
        tx,
        organizationId,
        headers,
        { referenceType: 'order_return', reason: 'return' },
        locale,
      );
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
   * A tracked line's lots, checked against what shipped on this order, and
   * a quantity for what shipped with no lot before the code's lot tracking
   * started (ADR-094, Q3a), beside them or alone.
   *
   * Every lot must have gone out on this order for this item, and never more
   * of it may come back than went; so too what went with no lot. The total
   * is summed in SQL, so the client never adds up decimals (ADR-025).
   */
  private async trackedParts(
    tx: Tx,
    organizationId: string,
    orderId: string,
    line: OrderLine,
    requested: ReturnLine,
  ): Promise<{ total: string; parts: ReturnPart[] }> {
    if (!requested.lots && !requested.quantity) {
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

    const lotIds = (requested.lots ?? []).map((lot) => lot.lotId);

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

    // The part with no lot first, as recordWithin orders a place's piles.
    const parts: ReturnPart[] = [
      ...(requested.quantity
        ? [{ lotId: null, quantity: requested.quantity }]
        : []),
      ...(requested.lots ?? []),
    ];
    const picked = sql.join(
      parts.map(
        (part) => sql`(${part.lotId}::uuid, ${part.quantity}::numeric)`,
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
          b.variant_id is null as never_shipped,
          coalesce(b.shipped, 0) - coalesce(b.returned, 0) < p.quantity as exceeds,
          coalesce(b.shipped, 0)::text as shipped,
          coalesce(b.returned, 0)::text as returned,
          sum(p.quantity) over ()::text as total
        from picked p
        left join balances b on b.lot_id is not distinct from p.lot_id
        left join lots l on l.id = p.lot_id and l.organization_id = ${organizationId}::uuid
      `)
    ).rows as {
      lot_id: string | null;
      code: string | null;
      never_shipped: boolean;
      exceeds: boolean;
      shipped: string;
      returned: string;
      total: string;
    }[];

    for (const row of checked) {
      // A quantity, for a tracked line none of which shipped with no lot.
      if (row.lot_id === null && row.never_shipped) {
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

      if (row.lot_id === null && row.exceeds) {
        throw new ConflictException(
          t(
            {
              id: 'orders.moreSkuFromBefore',
              defaultMessage:
                'That is more {sku} than shipped before its lot tracking started: {shipped} shipped then, {returned} already returned. Lower it to what is left.',
            },
            { sku: line.sku, shipped: row.shipped, returned: row.returned },
          ),
        );
      }

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

    return { total: checked[0].total, parts };
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
   * Shipped and returned per lot, for one item or all of them on an order,
   * a row with no lot for what shipped so: an untracked code's, or a
   * tracked code's from before its lot tracking started (ADR-094, Q3a).
   * Read from the ledger through the order's shipments and returns, so it is
   * the movements that decide, not a counter that could drift from them.
   *
   * Each arm's documents as `reference_id = any(array(select …))`, not
   * `in (select …)`: inside the OR, an `in` is a hashed subplan, which no
   * index serves, so every lot-carrying movement of the organization was
   * read and compared. The arrays are found first, once, and the
   * movements' reference index serves both arms in one bitmap OR (ADR-051,
   * the amendment for #225; #448).
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
        ${variant}
        and (
          (sm.reference_type = 'shipment' and sm.reference_id = any(array(
            select id from shipments
            where organization_id = ${organizationId}::uuid
              and order_id = ${orderId}::uuid
              -- A voided shipment never left (ADR-041), so nothing on it
              -- can come back.
              and voided_at is null
          )))
          or
          (sm.reference_type = 'order_return' and sm.reference_id = any(array(
            select id from order_returns
            where organization_id = ${organizationId}::uuid
              and order_id = ${orderId}::uuid
          )))
        )
      group by sm.variant_id, sm.lot_id
      having sum(sm.quantity) filter (where sm.reason = 'shipment') > 0
    `;
  }

  /** Each line's balances, by lot, with each lot's code and expiry. */
  private async balances(tx: Tx, organizationId: string, orderId: string) {
    const rows = (
      await tx.execute(sql`
        select
          b.variant_id,
          b.lot_id,
          l.code,
          l.expires_at,
          l.expiry,
          b.shipped::text as shipped,
          coalesce(b.returned, 0)::text as returned
        from (${this.balancesSql(organizationId, orderId)}) b
        left join lots l on l.id = b.lot_id and l.organization_id = ${organizationId}::uuid
        order by l.expires_at asc nulls last, l.code
      `)
    ).rows as {
      variant_id: string;
      lot_id: string | null;
      code: string | null;
      expires_at: string | null;
      expiry: LotExpiry | null;
      shipped: string;
      returned: string;
    }[];

    return rows.map((row) => ({
      variantId: row.variant_id,
      lotId: row.lot_id,
      code: row.code,
      expiresAt: row.expires_at,
      expiry: row.expiry,
      shipped: row.shipped,
      returned: row.returned,
    }));
  }
}
