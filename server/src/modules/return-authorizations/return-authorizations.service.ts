import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import {
  codeMatches,
  nameMatches,
  pinyinMatches,
  searchTerms,
} from '../../common/search';
import type { Transaction } from '../../database/database.module';
import {
  creditNoteLines,
  invoices,
  orderReturns,
  orders,
  partners,
  returnAuthorizationLines,
  returnAuthorizations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { takeNumber } from '../invoices/document-numbers';
import { loadOrder } from '../orders/load-order';
import { requestedLines } from '../orders/order-line-lookup';
import type { CreateReturnAuthorizationDto } from './dto/create-return-authorization.dto';
import type { ListReturnAuthorizationsDto } from './dto/list-return-authorizations.dto';
import { linesWithProgress } from './lines-with-progress';
import { lockOpen } from './lock-open';

const DEFAULT_LIMIT = 50;

/**
 * Return authorizations (ADR-047): the promise, made before anything moves,
 * that a customer may send goods back, and what happens to each item.
 *
 * This service raises, reads, cancels and closes them. Holding returns to
 * them is ReturnAuthorizationReceiptsService, and raising the replacement
 * order one promises is ReturnAuthorizationReplacementsService. Credit notes
 * issued for one live with invoicing.
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
      // Its number or its partner's name (ADR-056).
      if (query.search) {
        const terms = searchTerms(query.search);
        const match = or(
          codeMatches(returnAuthorizations.number, terms),
          nameMatches(partners.name, terms),
          pinyinMatches(partners.namePinyin, terms),
        );
        if (match) scope.push(match);
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

      return pageOf(rows, limit);
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

      if (!row)
        throw new NotFoundException(
          t({
            id: 'rmas.suchReturnAuthorization',
            defaultMessage: 'No such return authorization',
          }),
        );

      const lines = await linesWithProgress(
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
   * Refusals come before any write, in order: a line sent twice (400, by
   * the DTO); the order must exist (404), be a sale (400) and be confirmed
   * or closed — the orders that can have shipped anything (409); every line
   * must be on it (404); no line may authorize more than the customer
   * holds, shipped less returned (409); a sample may not be credited, since
   * nothing was billed (409); and a quoted invoice must be this order's and
   * issued (400/409).
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
        const order = await loadOrder(tx, organizationId, input.orderId);

        if (order.direction !== 'sale') {
          throw new BadRequestException(
            t({
              id: 'rmas.saleReturnedAgainstGoods',
              defaultMessage:
                'Only a sale is returned against. Goods sent back to a supplier are an adjustment.',
            }),
          );
        }

        if (order.status !== 'confirmed' && order.status !== 'fulfilled') {
          throw new ConflictException(
            t(
              {
                id: 'rmas.statusOrderShippedNothing',
                defaultMessage:
                  'A {status} order has shipped nothing to return',
              },
              { status: order.status },
            ),
          );
        }

        const ids = input.lines.map((line) => line.lineId);

        const lines = await requestedLines(tx, organizationId, order.id, ids);

        await this.assertWithinHoldings(tx, organizationId, input);

        if (
          order.isSample &&
          input.lines.some((line) => line.resolution === 'credit')
        ) {
          throw new ConflictException(
            t({
              id: 'rmas.sampleWasNeverBilled',
              defaultMessage:
                'A sample was never billed, so nothing on it can be credited — replace it, or take it back with no resolution',
            }),
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
      const rma = await lockOpen(tx, organizationId, returnAuthorizationId);

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
          t(
            {
              id: 'rmas.numberCreditAgainstSo',
              defaultMessage:
                '{number} already has {credit} against it, so it is closed rather than cancelled',
            },
            {
              number: rma.number,
              credit: received ? 'goods back' : 'a credit',
            },
          ),
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
      const rma = await lockOpen(tx, organizationId, returnAuthorizationId);

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
        t(
          {
            id: 'rmas.customerHoldsHeldSku',
            defaultMessage:
              'The customer holds {held} of {sku} — shipped less returned — so no more can be authorized to come back',
          },
          { held: short.held, sku: short.sku },
        ),
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

    if (!invoice)
      throw new BadRequestException(
        t({ id: 'rmas.suchInvoice', defaultMessage: 'No such invoice' }),
      );

    if (invoice.orderId !== orderId) {
      throw new ConflictException(
        t(
          {
            id: 'rmas.numberAnotherOrder',
            defaultMessage: '{number} is for another order',
          },
          { number: invoice.number ?? 'That invoice' },
        ),
      );
    }

    if (invoice.status !== 'issued') {
      throw new ConflictException(
        invoice.status === 'draft'
          ? t({
              id: 'rmas.credit.draftInvoice',
              defaultMessage:
                'That invoice is still a draft — nothing on it is owed yet, so nothing can be credited',
            })
          : t(
              {
                id: 'rmas.credit.voidedInvoice',
                defaultMessage:
                  '{number} was voided — it was credited in full already',
              },
              { number: invoice.number },
            ),
      );
    }
  }
}
