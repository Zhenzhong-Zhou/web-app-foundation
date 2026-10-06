import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { isUniqueViolation } from '../../database/errors';
import { addresses, orderLines, orders, partners } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { type Tx } from '../stock/stock.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { DuplicateOrderDto } from './dto/duplicate-order.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';
import { loadOrder } from './load-order';
import { insertLines } from './order-line-pricing';

type OrderLine = typeof orderLines.$inferSelect;

/**
 * Which status changes are allowed, and from where.
 *
 * A table rather than a chain of ifs, so an illegal transition is a lookup
 * that fails rather than a branch someone forgot to write. Cancelled and
 * received are terminal: a received order that turns out wrong is corrected by
 * an adjustment movement, not by reopening the document (ADR-023).
 */
const ALLOWED_FROM: Record<string, readonly string[]> = {
  draft: [],
  confirmed: ['draft'],
  fulfilled: ['confirmed'],
  cancelled: ['draft', 'confirmed'],
};

/**
 * An order's own life: creating one, duplicating one (ADR-031), and changing
 * its header and status.
 *
 * Its own service because it shares nothing with reading orders but the
 * database. Its lines are OrderLinesService and receiving is
 * OrderReceiptsService.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * The order and its lines together, because an order with no lines is a
   * document that orders nothing — and a failure after the header insert would
   * leave one behind. Same reasoning as products and their first variant
   * (ADR-023).
   */
  async create(input: CreateOrderDto, actorId: string) {
    try {
      return await this.tenantDb.transaction(async (tx, organizationId) => {
        const [partner] = await tx
          .select()
          .from(partners)
          .where(
            and(
              eq(partners.id, input.partnerId),
              eq(partners.organizationId, organizationId),
            ),
          );

        if (!partner)
          throw new BadRequestException(
            t({
              id: 'orders.unknownPartner',
              defaultMessage: 'Unknown partner',
            }),
          );

        // Retired partners stay in the directory but cannot take new orders —
        // that is the whole point of retiring rather than deleting (ADR-026).
        if (!partner.isActive) {
          throw new ConflictException(
            t(
              { id: 'orders.nameRetired', defaultMessage: '{name} is retired' },
              { name: partner.name },
            ),
          );
        }

        if (input.isSample && input.direction !== 'sale') {
          throw new BadRequestException(
            t({
              id: 'orders.saleSample',
              defaultMessage: 'Only a sale can be a sample',
            }),
          );
        }

        const [order] = await tx
          .insert(orders)
          .values({
            organizationId,
            partnerId: input.partnerId,
            direction: input.direction,
            isSample: input.isSample ?? false,
            reference: input.reference ?? null,
            // A calendar day as it arrives, YYYY-MM-DD (ADR-052).
            expectedAt: input.expectedAt ?? null,
            note: input.note ?? null,
            createdBy: actorId,
          })
          .returning();

        const lines = await insertLines(tx, organizationId, order, input.lines);

        this.logger.log(
          `Order ${order.id} created: ${input.direction}, ${lines.length} lines`,
        );

        return { ...order, lines };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The only unique constraint on order_lines. Two lines for one variant
        // make "how much did we order" ambiguous; amending is what editing is.
        throw new ConflictException(
          t({
            id: 'orders.sameItemAppearsTwice',
            defaultMessage:
              'The same item appears twice — amend the quantity instead',
          }),
        );
      }
      throw error;
    }
  }

  /**
   * Copies an order into a fresh draft (ADR-031).
   *
   * One rule decides every field: a duplicate re-resolves snapshots from their
   * live source and never copies frozen ones forward. A snapshot exists to
   * freeze what happened, and this has not happened yet.
   *
   * The intended flow is duplicate, fix, confirm, then cancel the original.
   * Cancelling first leaves nothing behind if this fails, and it is the order
   * people do it in anyway.
   */
  async duplicate(orderId: string, input: DuplicateOrderDto, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const source = await loadOrder(tx, organizationId, orderId);

      const [partner] = await tx
        .select()
        .from(partners)
        .where(
          and(
            eq(partners.id, source.partnerId),
            eq(partners.organizationId, organizationId),
          ),
        );

      /**
       * Checked again rather than assumed from the original. The partner was
       * active when that order was raised; retiring one is exactly what should
       * stop a new order going to them, and a duplicate is a new order
       * (ADR-026).
       */
      if (!partner?.isActive) {
        throw new ConflictException(
          t(
            { id: 'orders.nameRetired', defaultMessage: '{name} is retired' },
            { name: partner?.name ?? 'That partner' },
          ),
        );
      }

      const sourceLines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId))
        .orderBy(asc(orderLines.id));

      if (sourceLines.length === 0) {
        throw new ConflictException(
          t({
            id: 'orders.orderLinesCopy',
            defaultMessage: 'That order has no lines to copy',
          }),
        );
      }

      /**
       * Duplicating a partly received order would re-order what already
       * arrived (ADR-031). Copying only the shortfall is a backorder, which
       * means something different and is open — so this refuses rather than
       * quietly doing the wrong one.
       */
      if (sourceLines.some((line) => Number(line.quantityFulfilled) > 0)) {
        throw new ConflictException(
          t({
            id: 'orders.partOrderReceivedDuplicating',
            defaultMessage:
              'Part of this order has already been received — duplicating it would re-order what arrived',
          }),
        );
      }

      const shipTo = await this.reResolveShipTo(tx, organizationId, source);

      const [order] = await tx
        .insert(orders)
        .values({
          organizationId,
          partnerId: source.partnerId,
          direction: source.direction,
          isSample: source.isSample,
          note: source.note,
          createdBy: actorId,
          duplicatedFromId: source.id,
          ...shipTo,

          /**
           * Never copied from the source, each for its own reason. `reference`
           * is the supplier's PO number for the order it was issued against,
           * and two orders claiming it is a reconciliation problem.
           * `expectedAt` would be last month's date on a new order, wrong
           * every time. Both are the copy's own instead, as the dialog asks
           * for them, or empty until the edit form sets them.
           */
          reference: input.reference ?? null,
          expectedAt: input.expectedAt ?? null,

          /**
           * Absent on purpose. `status` defaults to draft because the point
           * is that somebody reviews it. Quantities fulfilled start at zero
           * because nothing has arrived.
           */
        })
        .returning();

      /**
       * insertLines re-reads each variant to snapshot its SKU, so the copy
       * picks up a renamed SKU for free — and refuses a variant that has since
       * moved organizations, which a blind copy of the old line would not.
       */
      const lines = await insertLines(
        tx,
        organizationId,
        order,
        sourceLines.map((line) => ({
          variantId: line.variantId,
          quantityOrdered: line.quantityOrdered,
          unitPrice: line.unitPrice ?? undefined,
          currency: line.currency ?? undefined,
          priceSource: line.priceSource === 'list' ? 'list' : 'manual',
          priceListId: line.priceListId ?? undefined,
        })),
      );

      this.logger.log(
        `Order ${order.id} duplicated from ${source.id}, ${lines.length} lines`,
      );

      return { ...order, lines };
    });
  }

  /**
   * Header fields and status. Lines are edited through their own routes,
   * because changing a quantity that has already been partly received is a
   * different question from renaming a reference.
   */
  async update(orderId: string, input: UpdateOrderDto) {
    const [existing] = await this.tenantDb.select(
      orders,
      eq(orders.id, orderId),
    );

    if (!existing)
      throw new NotFoundException(
        t({ id: 'orders.suchOrder', defaultMessage: 'No such order' }),
      );

    /**
     * A reference is matched against a supplier invoice once goods arrive, so
     * changing it afterwards breaks that link silently. Expected date and note
     * carry no such dependency and stay editable at any status — what other
     * records depend on is what becomes immutable.
     */
    if (
      input.reference !== undefined &&
      input.reference !== existing.reference &&
      existing.status === 'fulfilled'
    ) {
      throw new ConflictException(
        t({
          id: 'orders.referenceChangeOnceOrder',
          defaultMessage:
            'The reference cannot change once an order is fulfilled — it is what an invoice is matched against',
        }),
      );
    }

    if (input.status && input.status !== existing.status) {
      const from = ALLOWED_FROM[input.status] ?? [];

      if (!from.includes(existing.status)) {
        throw new ConflictException(
          t(
            {
              id: 'orders.orderGoStatusStatus',
              defaultMessage: 'An order cannot go from {from} to {to}',
            },
            { from: existing.status, to: input.status },
          ),
        );
      }
    }

    /**
     * A sale is priced, in one currency, before it is confirmed (ADR-046).
     * Confirming is the customer's commitment and the moment a price is
     * agreed; an invoice cannot bill a line nobody priced, and it is paid in
     * one currency. Samples are exempt: they ship, but are never invoiced.
     *
     * Read outside a transaction, like the cancel check below, so a line
     * added between this read and the status write slips past. That is the
     * race in #26, and it closes when update() moves into one transaction.
     */
    if (
      input.status === 'confirmed' &&
      existing.direction === 'sale' &&
      !existing.isSample
    ) {
      const lines = await this.tenantDb.select(
        orderLines,
        eq(orderLines.orderId, orderId),
      );

      this.assertSaleIsInvoiceable(lines);
    }

    /**
     * Cancelling says the order never happened. Once goods have moved against
     * it, that is untrue — close it short instead, which keeps what shipped
     * or arrived on the record (ADR-023).
     */
    if (input.status === 'cancelled') {
      const [moved] = await this.tenantDb.select(
        orderLines,
        and(
          eq(orderLines.orderId, orderId),
          gt(orderLines.quantityFulfilled, '0'),
        ),
      );

      if (moved) {
        throw new ConflictException(
          t({
            id: 'orders.goodsMovedAgainstOrder',
            defaultMessage:
              'Goods have already moved against this order, so it cannot be cancelled — close it instead',
          }),
        );
      }
    }

    /**
     * Built field by field rather than spread: a spread would carry any future
     * DTO field straight into the table, which is how a validation-only
     * property ends up as a column write nobody intended.
     */
    await this.tenantDb.update(
      orders,
      {
        status: input.status,
        // Its place in line for stock (ADR-045). Set once, on confirming.
        ...(input.status === 'confirmed' ? { confirmedAt: new Date() } : {}),
        reference: input.reference,
        note: input.note,
        // YYYY-MM-DD as it arrives (ADR-052); undefined leaves it alone.
        expectedAt: input.expectedAt,
      },
      eq(orders.id, orderId),
    );

    recordPrevious({
      reference: existing.reference,
      expectedAt: existing.expectedAt,
    });

    this.logger.log(`Order ${orderId} updated`);
  }

  /**
   * What an invoice will need from a sale, checked when it is confirmed
   * (ADR-046): every line priced, and one currency. Zero is a price, since
   * a free line is real; null means nobody decided, and an invoice cannot
   * bill an undecided amount.
   */
  private assertSaleIsInvoiceable(
    lines: Pick<OrderLine, 'sku' | 'unitPrice' | 'currency'>[],
  ): void {
    const unpriced = lines.filter((line) => line.unitPrice === null);

    if (unpriced.length > 0) {
      const skus = unpriced.map((line) => line.sku).join(', ');

      throw new ConflictException(
        t(
          {
            id: 'orders.everyItemSaleNeeds',
            defaultMessage:
              'Every item on a sale needs a price before it is confirmed. {skus} {count, plural, one {has} other {have}} none; zero is a price',
          },
          { skus, count: unpriced.length },
        ),
      );
    }

    const currencies = [...new Set(lines.map((line) => line.currency))].sort();

    if (currencies.length > 1) {
      throw new ConflictException(
        t(
          {
            id: 'orders.saleInvoicedOneCurrency',
            defaultMessage:
              'A sale is invoiced in one currency, and this one has {currencies}. Price every item in one of them',
          },
          // A list, joined the way each language joins one. Every line
          // here has a currency: an unpriced one was refused above.
          { currencies: currencies.filter((code) => code !== null) },
        ),
      );
    }
  }

  /**
   * The ship-to snapshot, read from the live address rather than copied.
   *
   * Copying the stored columns forward would put an address that may have been
   * retired since onto a live order — the exact thing the snapshot was never
   * meant to enable. If the original address is gone, the partner's default
   * shipping address stands in, and the caller is told so the difference is
   * visible before the order is confirmed.
   *
   * Returns nothing when the source had no ship-to, which today is every
   * order: `create` does not set one yet. The rule is here for when it does.
   */
  private async reResolveShipTo(
    tx: Tx,
    organizationId: string,
    source: typeof orders.$inferSelect,
  ) {
    if (!source.shipToAddressId) return {};

    const [original] = await tx
      .select()
      .from(addresses)
      .where(
        and(
          eq(addresses.id, source.shipToAddressId),
          eq(addresses.organizationId, organizationId),
        ),
      );

    let address = original?.isActive ? original : undefined;

    if (!address) {
      [address] = await tx
        .select()
        .from(addresses)
        .where(
          and(
            eq(addresses.organizationId, organizationId),
            eq(addresses.partnerId, source.partnerId),
            eq(addresses.isShipping, true),
            eq(addresses.isDefault, true),
            eq(addresses.isActive, true),
          ),
        );
    }

    if (!address) return {};

    return {
      shipToAddressId: address.id,
      shipToLabel: address.label,
      shipToLine1: address.line1,
      shipToLine2: address.line2,
      shipToCity: address.city,
      shipToRegion: address.region,
      shipToPostalCode: address.postalCode,
      shipToCountry: address.country,
    };
  }
}
