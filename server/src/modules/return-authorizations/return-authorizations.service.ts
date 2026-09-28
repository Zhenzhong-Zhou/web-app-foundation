import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import {
  creditNoteLines,
  invoices,
  orderLines,
  orderReturns,
  orders,
  partners,
  returnAuthorizationLines,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { takeNumber } from '../invoices/document-numbers';
import { requestedLines } from '../orders/order-line-lookup';
import type { CreateReturnAuthorizationDto } from './dto/create-return-authorization.dto';
import type { ListReturnAuthorizationsDto } from './dto/list-return-authorizations.dto';

const DEFAULT_LIMIT = 50;

/**
 * Return authorizations (ADR-047): the promise, made before anything moves,
 * that a customer may send goods back, and what happens to each item.
 *
 * This service raises, reads, cancels and closes them, and holds returns to
 * them: the returns route asks it before receiving against one, and a
 * return received without one is linked here. Credit notes issued for one
 * live with invoicing.
 */
@Injectable()
export class ReturnAuthorizationsService {
  private readonly logger = new Logger(ReturnAuthorizationsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  async list(query: ListReturnAuthorizationsDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(returnAuthorizations.organizationId, organizationId)];

      if (query.before) scope.push(lt(returnAuthorizations.id, query.before));
      if (query.status) {
        scope.push(eq(returnAuthorizations.status, query.status));
      }
      if (query.orderId) {
        scope.push(eq(returnAuthorizations.orderId, query.orderId));
      }

      const rows = await tx
        .select({
          id: returnAuthorizations.id,
          number: returnAuthorizations.number,
          status: returnAuthorizations.status,
          orderId: returnAuthorizations.orderId,
          orderReference: orders.reference,
          partnerId: returnAuthorizations.partnerId,
          partnerName: partners.name,
          reason: returnAuthorizations.reason,
          expectsGoods: returnAuthorizations.expectsGoods,
          createdAt: returnAuthorizations.createdAt,
        })
        .from(returnAuthorizations)
        .innerJoin(orders, eq(orders.id, returnAuthorizations.orderId))
        .innerJoin(partners, eq(partners.id, returnAuthorizations.partnerId))
        .where(and(...scope))
        // UUIDv7 is chronological, so one column is the cursor.
        .orderBy(desc(returnAuthorizations.id))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const entries = hasMore ? rows.slice(0, limit) : rows;

      return {
        entries,
        nextCursor: hasMore ? entries[entries.length - 1].id : null,
      };
    });
  }

  /**
   * An RMA with, per line, what was authorized, what has come back against
   * it, and what has been credited — the three figures anyone deciding the
   * next step needs side by side.
   */
  async findById(returnAuthorizationId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          rma: returnAuthorizations,
          partnerName: partners.name,
          orderReference: orders.reference,
          invoiceNumber: invoices.number,
        })
        .from(returnAuthorizations)
        .innerJoin(orders, eq(orders.id, returnAuthorizations.orderId))
        .innerJoin(partners, eq(partners.id, returnAuthorizations.partnerId))
        .leftJoin(invoices, eq(invoices.id, returnAuthorizations.invoiceId))
        .where(
          and(
            eq(returnAuthorizations.organizationId, organizationId),
            eq(returnAuthorizations.id, returnAuthorizationId),
          ),
        );

      if (!row) throw new NotFoundException('No such return authorization');

      const lines = await this.linesWithProgress(
        tx,
        organizationId,
        returnAuthorizationId,
      );

      return {
        ...row.rma,
        partnerName: row.partnerName,
        orderReference: row.orderReference,
        invoiceNumber: row.invoiceNumber,
        lines,
      };
    });
  }

  /**
   * Raises an RMA, authorized, with its number (ADR-047).
   *
   * Refusals come before any write, in order: the order must exist (404) and
   * be a confirmed or closed sale — the orders that can have shipped
   * anything (409); every line must be on it (404) and appear once (400);
   * no line may authorize more than the customer holds, shipped less
   * returned (409); a sample may not be credited, since nothing was billed
   * (409); and a quoted invoice must be this order's and issued (400/409).
   *
   * The ceiling is what the customer holds, not that less what other open
   * RMAs expect. Two RMAs for the same goods cannot both be received — the
   * returns route stops what was never shipped — and cannot both be
   * credited, since credits are capped by value per invoice line. A third
   * limit here would add a figure to explain and nothing to protect.
   */
  async create(input: CreateReturnAuthorizationDto, actorId: string) {
    const created = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const [order] = await tx
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, organizationId),
              eq(orders.id, input.orderId),
            ),
          );

        if (!order) throw new NotFoundException('No such order');

        if (order.direction !== 'sale') {
          throw new ConflictException(
            'Only a sale is returned against. Goods sent back to a supplier are an adjustment.',
          );
        }

        if (order.status !== 'confirmed' && order.status !== 'fulfilled') {
          throw new ConflictException(
            `A ${order.status} order has shipped nothing to return`,
          );
        }

        const ids = input.lines.map((line) => line.lineId);

        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException(
            'A line appears twice on one RMA — send its total once',
          );
        }

        const lines = await requestedLines(tx, organizationId, order.id, ids);

        await this.assertWithinHoldings(tx, organizationId, input);

        if (
          order.isSample &&
          input.lines.some((line) => line.resolution === 'credit')
        ) {
          throw new ConflictException(
            'A sample was never billed, so nothing on it can be credited — replace it, or take it back with no resolution',
          );
        }

        if (input.invoiceId) {
          await this.assertCreditable(
            tx,
            organizationId,
            input.invoiceId,
            order.id,
          );
        }

        // After every refusal, so a refused RMA leaves no gap in the series.
        const number = await takeNumber(
          tx,
          organizationId,
          'return_authorization',
        );

        const [rma] = await tx
          .insert(returnAuthorizations)
          .values({
            organizationId,
            number,
            orderId: order.id,
            partnerId: order.partnerId,
            invoiceId: input.invoiceId ?? null,
            reason: input.reason,
            expectsGoods: input.expectsGoods ?? true,
            note: input.note || null,
            createdBy: actorId,
          })
          .returning();

        const inserted = await tx
          .insert(returnAuthorizationLines)
          .values(
            input.lines.map((requested) => {
              const line = lines.find((row) => row.id === requested.lineId)!;
              return {
                organizationId,
                returnAuthorizationId: rma.id,
                orderLineId: line.id,
                variantId: line.variantId,
                sku: line.sku,
                quantity: requested.quantity,
                resolution: requested.resolution,
              };
            }),
          )
          .returning();

        return { ...rma, lines: inserted };
      },
    );

    this.logger.log(
      `Return authorization ${created.number} raised on order ${created.orderId}`,
    );
    return created;
  }

  /**
   * Cancelled while nothing has come back against it and nothing has been
   * credited. After that it is closed, not cancelled: something happened
   * under it, and cancelling says nothing did — the rule that stops a
   * shipped order being cancelled (ADR-023).
   */
  async cancel(returnAuthorizationId: string, actorId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const rma = await this.lockOpen(
        tx,
        organizationId,
        returnAuthorizationId,
      );

      const [received] = await tx
        .select({ id: orderReturns.id })
        .from(orderReturns)
        .where(
          and(
            eq(orderReturns.organizationId, organizationId),
            eq(orderReturns.returnAuthorizationId, rma.id),
          ),
        )
        .limit(1);

      const [credited] = await tx
        .select({ id: creditNoteLines.id })
        .from(creditNoteLines)
        .innerJoin(
          returnAuthorizationLines,
          eq(
            returnAuthorizationLines.id,
            creditNoteLines.returnAuthorizationLineId,
          ),
        )
        .where(
          and(
            eq(creditNoteLines.organizationId, organizationId),
            eq(returnAuthorizationLines.returnAuthorizationId, rma.id),
          ),
        )
        .limit(1);

      if (received || credited) {
        throw new ConflictException(
          `${rma.number} already has ${
            received ? 'goods back' : 'a credit'
          } against it, so it is closed rather than cancelled`,
        );
      }

      await tx
        .update(returnAuthorizations)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: actorId,
        })
        .where(
          and(
            eq(returnAuthorizations.organizationId, organizationId),
            eq(returnAuthorizations.id, rma.id),
          ),
        );
    });
  }

  /**
   * A person saying nothing more will happen under it — everything back and
   * resolved, or the customer never sent the rest. Arithmetic does not
   * close it, as it does not close an order (ADR-027).
   */
  async close(returnAuthorizationId: string, actorId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      const rma = await this.lockOpen(
        tx,
        organizationId,
        returnAuthorizationId,
      );

      await tx
        .update(returnAuthorizations)
        .set({ status: 'closed', closedAt: new Date(), closedBy: actorId })
        .where(
          and(
            eq(returnAuthorizations.organizationId, organizationId),
            eq(returnAuthorizations.id, rma.id),
          ),
        );
    });
  }

  /**
   * For the lines resolved as replace: a draft sale for the same goods at
   * zero, linked to the RMA (ADR-047). It then confirms, ships and traces
   * as any sale does — zero is a price (ADR-046), so it passes confirm
   * without a special case, and invoices at zero if anyone invoices it.
   *
   * A replacement for a sample is a sample, unpriced, as the original was.
   * The ship-to is copied from the original order, since the goods go back
   * to where the faulty ones came from. One standing replacement per RMA:
   * cancel it to raise another, so the same goods are not sent twice.
   */
  async raiseReplacement(returnAuthorizationId: string, actorId: string) {
    const raised = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const rma = await this.lockOpen(
          tx,
          organizationId,
          returnAuthorizationId,
        );

        const [standing] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.organizationId, organizationId),
              eq(orders.returnAuthorizationId, rma.id),
              ne(orders.status, 'cancelled'),
            ),
          )
          .limit(1);

        if (standing) {
          throw new ConflictException(
            `${rma.number} already has a replacement order — cancel it to raise another`,
          );
        }

        const replaced = await tx
          .select({
            variantId: returnAuthorizationLines.variantId,
            sku: returnAuthorizationLines.sku,
            quantity: returnAuthorizationLines.quantity,
            currency: orderLines.currency,
          })
          .from(returnAuthorizationLines)
          .innerJoin(
            orderLines,
            eq(orderLines.id, returnAuthorizationLines.orderLineId),
          )
          .where(
            and(
              eq(returnAuthorizationLines.organizationId, organizationId),
              eq(returnAuthorizationLines.returnAuthorizationId, rma.id),
              eq(returnAuthorizationLines.resolution, 'replace'),
            ),
          )
          .orderBy(asc(returnAuthorizationLines.sku));

        if (replaced.length === 0) {
          throw new ConflictException(
            `Nothing on ${rma.number} is to be replaced`,
          );
        }

        const [original] = await tx
          .select({
            order: orders,
            partnerActive: partners.isActive,
            partnerName: partners.name,
          })
          .from(orders)
          .innerJoin(partners, eq(partners.id, orders.partnerId))
          .where(
            and(
              eq(orders.organizationId, organizationId),
              eq(orders.id, rma.orderId),
            ),
          );

        // Retired partners take no new orders (ADR-026), replacements included.
        if (!original.partnerActive) {
          throw new ConflictException(
            `${original.partnerName} is retired, so no new order can be raised for them`,
          );
        }

        const source = original.order;

        const [order] = await tx
          .insert(orders)
          .values({
            organizationId,
            partnerId: source.partnerId,
            direction: 'sale',
            isSample: source.isSample,
            note: `Replacement for ${rma.number}`,
            shipToAddressId: source.shipToAddressId,
            shipToLabel: source.shipToLabel,
            shipToLine1: source.shipToLine1,
            shipToLine2: source.shipToLine2,
            shipToCity: source.shipToCity,
            shipToRegion: source.shipToRegion,
            shipToPostalCode: source.shipToPostalCode,
            shipToCountry: source.shipToCountry,
            returnAuthorizationId: rma.id,
            createdBy: actorId,
          })
          .returning();

        await tx.insert(orderLines).values(
          replaced.map((line) => {
            // A sample stays unpriced; anything else is priced at zero in
            // the original's currency, so confirm accepts it as it stands.
            const priced = !source.isSample && line.currency !== null;
            return {
              organizationId,
              orderId: order.id,
              variantId: line.variantId,
              sku: line.sku,
              quantityOrdered: line.quantity,
              unitPrice: priced ? '0' : null,
              currency: priced ? line.currency : null,
            };
          }),
        );

        recordContext({ order: order.id });

        return { order, rmaNumber: rma.number };
      },
    );

    this.logger.log(
      `Replacement order ${raised.order.id} raised for ${raised.rmaNumber}`,
    );
    return raised.order;
  }

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

    const lines = await this.linesWithProgress(tx, organizationId, rma.id);

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
      ReturnType<ReturnAuthorizationsService['lockForReceipt']>
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
      const rma = await this.lockOpen(
        tx,
        organizationId,
        returnAuthorizationId,
      );

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

  /**
   * Per line: authorized, received against this RMA, and credited against
   * it. Received sums the `return` movements of returns naming this RMA, for
   * the line's variant — an order has one line per variant (ADR-027).
   * Summed in SQL and returned as numeric text (ADR-025).
   */
  async linesWithProgress(
    tx: Transaction,
    organizationId: string,
    returnAuthorizationId: string,
  ) {
    return tx
      .select({
        id: returnAuthorizationLines.id,
        orderLineId: returnAuthorizationLines.orderLineId,
        variantId: returnAuthorizationLines.variantId,
        sku: returnAuthorizationLines.sku,
        quantity: returnAuthorizationLines.quantity,
        resolution: returnAuthorizationLines.resolution,
        /**
         * The outer row is named in plain SQL, not through Drizzle: in a
         * query with no joins Drizzle writes a column without its table, and
         * inside a subquery a bare "id" or "variant_id" binds to the
         * subquery's own tables instead of this row.
         */
        quantityReceived: sql<string>`coalesce((
          select sum(sm.quantity)
          from stock_movements sm
          join order_returns r on r.id = sm.reference_id
          where sm.organization_id = ${organizationId}::uuid
            and sm.reason = 'return'
            and sm.reference_type = 'order_return'
            and r.return_authorization_id = return_authorization_lines.return_authorization_id
            and sm.variant_id = return_authorization_lines.variant_id
        ), 0)::numeric(18, 4)::text`,
        quantityCredited: sql<string>`coalesce((
          select sum(cnl.quantity)
          from credit_note_lines cnl
          where cnl.organization_id = ${organizationId}::uuid
            and cnl.return_authorization_line_id = return_authorization_lines.id
        ), 0)::numeric(18, 4)::text`,
      })
      .from(returnAuthorizationLines)
      .where(
        and(
          eq(returnAuthorizationLines.organizationId, organizationId),
          eq(
            returnAuthorizationLines.returnAuthorizationId,
            returnAuthorizationId,
          ),
        ),
      )
      .orderBy(asc(returnAuthorizationLines.sku));
  }

  /**
   * No line may authorize more than the customer holds: shipped less
   * returned. One statement over every requested line, compared in SQL.
   */
  private async assertWithinHoldings(
    tx: Transaction,
    organizationId: string,
    input: CreateReturnAuthorizationDto,
  ) {
    const requested = sql.join(
      input.lines.map(
        (line) => sql`(${line.lineId}::uuid, ${line.quantity}::numeric)`,
      ),
      sql`, `,
    );

    const result = await tx.execute<{ sku: string; held: string }>(sql`
      select ol.sku,
             (ol.quantity_fulfilled - ol.quantity_returned)::numeric(18, 4)::text as held
      from order_lines ol
      join (values ${requested}) as r(id, quantity) on r.id = ol.id
      where ol.organization_id = ${organizationId}::uuid
        and ol.quantity_fulfilled - ol.quantity_returned < r.quantity
      order by ol.sku
      limit 1
    `);

    const [short] = result.rows;

    if (short) {
      throw new ConflictException(
        `The customer holds ${short.held} of ${short.sku} — shipped less returned — so no more can be authorized to come back`,
      );
    }
  }

  /**
   * A quoted invoice is the one the credit will default to, so it must be
   * one that can be credited: this tenant's (400, as any id in a body),
   * this order's, and issued (409).
   */
  private async assertCreditable(
    tx: Transaction,
    organizationId: string,
    invoiceId: string,
    orderId: string,
  ) {
    const [invoice] = await tx
      .select({
        orderId: invoices.orderId,
        status: invoices.status,
        number: invoices.number,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, invoiceId),
        ),
      );

    if (!invoice) throw new BadRequestException('No such invoice');

    if (invoice.orderId !== orderId) {
      throw new ConflictException(
        `${invoice.number ?? 'That invoice'} is for another order`,
      );
    }

    if (invoice.status !== 'issued') {
      throw new ConflictException(
        invoice.status === 'draft'
          ? 'That invoice is still a draft — nothing on it is owed yet, so nothing can be credited'
          : `${invoice.number} was voided — it was credited in full already`,
      );
    }
  }

  /** The RMA, locked, and only if it is still open. */
  private async lockOpen(
    tx: Transaction,
    organizationId: string,
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

    if (!rma) throw new NotFoundException('No such return authorization');

    if (rma.status !== 'open') {
      throw new ConflictException(`${rma.number} is already ${rma.status}`);
    }

    return rma;
  }
}
