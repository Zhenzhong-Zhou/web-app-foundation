import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import { orderReturns, returnAuthorizations } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { linesWithProgress } from './lines-with-progress';
import { lockOpen } from './lock-open';

/**
 * Holding returns to their RMAs (ADR-047): the lock and the limit a return
 * received against one meets at the dock, and linking a return that was
 * received without one.
 *
 * Its own service because this is the side of an RMA that goods coming back
 * answer to, and the only part another module calls: the returns route asks
 * it, inside its own transaction, before receiving against one.
 */
@Injectable()
export class ReturnAuthorizationReceiptsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * For the returns route: the RMA a return names, locked, so two boxes
   * received against it at once queue rather than both pass the limit, with
   * each line's progress so far.
   *
   * Refused unless it is this tenant's (400, as any id in a body), this
   * order's, open, and expecting goods (409). An RMA that told the customer
   * to keep the goods takes no receipt; if they send them anyway, the
   * return is received without it and linked, which the person decides.
   */
  async lockForReceipt(
    tx: Transaction,
    organizationId: string,
    orderId: string,
    returnAuthorizationId: string,
  ) {
    const [rma] = await tx
      .select()
      .from(returnAuthorizations)
      .where(
        and(
          eq(returnAuthorizations.organizationId, organizationId),
          eq(returnAuthorizations.id, returnAuthorizationId),
        ),
      )
      .for('update');

    if (!rma) throw new BadRequestException('No such return authorization');

    if (rma.orderId !== orderId) {
      throw new ConflictException(`${rma.number} is for another order`);
    }

    if (rma.status !== 'open') {
      throw new ConflictException(
        `${rma.number} is ${rma.status}, so nothing more is received against it`,
      );
    }

    if (!rma.expectsGoods) {
      throw new ConflictException(
        `${rma.number} told the customer to keep the goods — receive this without it, and link it if it should count`,
      );
    }

    const lines = await linesWithProgress(tx, organizationId, rma.id);

    return { rma, lines };
  }

  /**
   * One line of a return, held to its RMA: the item must be on it, and no
   * more may come back than it authorized less what earlier returns
   * against it brought. Compared in SQL (ADR-025).
   */
  async assertWithinAuthorized(
    tx: Transaction,
    authorization: Awaited<
      ReturnType<ReturnAuthorizationReceiptsService['lockForReceipt']>
    >,
    variantId: string,
    sku: string,
    total: string,
  ) {
    const { rma, lines } = authorization;
    const line = lines.find((row) => row.variantId === variantId);

    if (!line) {
      throw new ConflictException(`${sku} is not on ${rma.number}`);
    }

    const result = await tx.execute<{ within: boolean; remaining: string }>(sql`
      select
        ${total}::numeric <= ${line.quantity}::numeric - ${line.quantityReceived}::numeric as within,
        (${line.quantity}::numeric - ${line.quantityReceived}::numeric)::numeric(18, 4)::text as remaining
    `);

    const [check] = result.rows;

    if (!check.within) {
      throw new ConflictException(
        `${rma.number} has ${check.remaining} of ${sku} left to come back, less than this return brings`,
      );
    }
  }

  /**
   * Counts a return received without an RMA against this one (ADR-047):
   * goods on the dock were recorded as they arrived, and the agreement came
   * after. Set once — a return already counted against an RMA is not moved
   * to another.
   *
   * Every item the return brought must be on the RMA, within what it has
   * left to receive: the limit a return naming it at the dock would have
   * met. Refused otherwise, before anything changes.
   */
  async linkReturn(returnAuthorizationId: string, returnId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const rma = await lockOpen(tx, organizationId, returnAuthorizationId);

      const [received] = await tx
        .select()
        .from(orderReturns)
        .where(
          and(
            eq(orderReturns.organizationId, organizationId),
            eq(orderReturns.id, returnId),
          ),
        )
        .for('update');

      if (!received) throw new BadRequestException('No such return');

      if (received.orderId !== rma.orderId) {
        throw new ConflictException('That return is on another order');
      }

      if (received.returnAuthorizationId) {
        throw new ConflictException(
          received.returnAuthorizationId === rma.id
            ? `That return is already counted against ${rma.number}`
            : 'That return is already counted against another RMA',
        );
      }

      const result = await tx.execute<{
        sku: string;
        missing: boolean;
        remaining: string | null;
      }>(sql`
        with came as (
          select sm.variant_id, sum(sm.quantity) as quantity
          from stock_movements sm
          where sm.organization_id = ${organizationId}::uuid
            and sm.reason = 'return'
            and sm.reference_type = 'order_return'
            and sm.reference_id = ${received.id}::uuid
          group by sm.variant_id
        )
        select v.sku,
               ral.id is null as missing,
               (ral.quantity - coalesce(so_far.quantity, 0))::numeric(18, 4)::text as remaining
        from came c
        join product_variants v on v.id = c.variant_id
        left join return_authorization_lines ral
          on ral.return_authorization_id = ${rma.id}::uuid
         and ral.variant_id = c.variant_id
        left join lateral (
          select sum(sm.quantity) as quantity
          from stock_movements sm
          join order_returns r on r.id = sm.reference_id
          where sm.organization_id = ${organizationId}::uuid
            and sm.reason = 'return'
            and sm.reference_type = 'order_return'
            and r.return_authorization_id = ${rma.id}::uuid
            and sm.variant_id = c.variant_id
        ) so_far on true
        where ral.id is null
           or c.quantity > ral.quantity - coalesce(so_far.quantity, 0)
        order by v.sku
        limit 1
      `);

      const [refused] = result.rows;

      if (refused) {
        throw new ConflictException(
          refused.missing
            ? `${refused.sku} came back on that return but is not on ${rma.number}`
            : `${rma.number} has ${refused.remaining} of ${refused.sku} left to come back, less than that return brought`,
        );
      }

      await tx
        .update(orderReturns)
        .set({ returnAuthorizationId: rma.id })
        .where(
          and(
            eq(orderReturns.organizationId, organizationId),
            eq(orderReturns.id, received.id),
          ),
        );

      recordContext({ returnAuthorization: rma.number });
    });
  }
}
