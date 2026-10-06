import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import {
  orderLines,
  orders,
  partners,
  returnAuthorizationLines,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { lockOpen } from './lock-open';

/**
 * Raising the replacement order an RMA promises for the lines resolved as
 * replace (ADR-047).
 *
 * Its own service because it writes an order, not an RMA: a new sale for
 * the original's customer and ship-to, carrying the RMA's replace lines at
 * zero. The RMA itself is locked while it happens and left as it was.
 */
@Injectable()
export class ReturnAuthorizationReplacementsService {
  private readonly logger = new Logger(
    ReturnAuthorizationReplacementsService.name,
  );

  constructor(private readonly tenantDb: TenantDb) {}

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
        const rma = await lockOpen(tx, organizationId, returnAuthorizationId);

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
            t(
              {
                id: 'rmas.numberReplacementOrderCancel',
                defaultMessage:
                  '{number} already has a replacement order — cancel it to raise another',
              },
              { number: rma.number },
            ),
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
            t(
              {
                id: 'rmas.nothingNumberReplaced',
                defaultMessage: 'Nothing on {number} is to be replaced',
              },
              { number: rma.number },
            ),
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
            t(
              {
                id: 'rmas.partnernameRetiredSoNew',
                defaultMessage:
                  '{partnerName} is retired, so no new order can be raised for them',
              },
              { partnerName: original.partnerName },
            ),
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
              // Zero on purpose, not from a list (ADR-049).
              priceSource: priced ? 'manual' : null,
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
}
