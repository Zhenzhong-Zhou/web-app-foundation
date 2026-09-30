import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import { isUniqueViolation } from '../../database/errors';
import {
  invoiceLines,
  invoices,
  orderLines,
  orders,
  products,
  productVariants,
  shipments,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { itemName } from '../stock/item-name';
import { TaxCodesService } from '../tax-codes/tax-codes.service';
import type { CreateInvoiceDto } from './dto/create-invoice.dto';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto';
import type { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { lockDraft } from './lock-draft';

/**
 * A draft invoice while it is still a draft (ADR-046): made from a shipment,
 * edited, deleted. InvoicesService reads invoices and InvoiceIssuingService
 * issues and voids them; nothing here touches one that has been issued.
 */
@Injectable()
export class InvoiceDraftsService {
  private readonly logger = new Logger(InvoiceDraftsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly taxCodes: TaxCodesService,
  ) {}

  /**
   * A draft for exactly what the shipment carried, priced from its order.
   *
   * Refusals, in order: the shipment must exist here (404), still stand,
   * belong to a sale that is not a sample, and have carried something
   * priced in one currency (409). Confirm already guarantees the last two
   * for any sale confirmed since ADR-046; they are checked again because an
   * invoice cannot bill an undecided amount whatever came before.
   */
  async createDraft(input: CreateInvoiceDto, actorId: string) {
    if (input.taxCodeId) await this.assertUsableTaxCode(input.taxCodeId);

    try {
      const created = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          const [shipment] = await tx
            .select({
              id: shipments.id,
              orderId: shipments.orderId,
              voidedAt: shipments.voidedAt,
              partnerId: orders.partnerId,
              direction: orders.direction,
              isSample: orders.isSample,
            })
            .from(shipments)
            .innerJoin(orders, eq(orders.id, shipments.orderId))
            .where(
              and(
                eq(shipments.organizationId, organizationId),
                eq(shipments.id, input.shipmentId),
              ),
            )
            /**
             * Shared, against Void shipment's exclusive lock (ADR-046). A
             * void in progress makes this wait and then see the shipment
             * voided; a draft being created makes the void wait and then
             * see the invoice. Neither can slip past the other.
             */
            .for('share', { of: shipments });

          if (!shipment) throw new NotFoundException('No such shipment');

          if (shipment.voidedAt) {
            throw new ConflictException(
              'That shipment was voided — nothing left, so there is nothing to bill',
            );
          }

          if (shipment.direction !== 'sale') {
            throw new ConflictException('Only a sale is invoiced');
          }

          if (shipment.isSample) {
            throw new ConflictException(
              'Samples are not invoiced — they ship and trace like sales, but nobody pays for them',
            );
          }

          const carried = await this.carriedBy(
            tx,
            organizationId,
            shipment.id,
            shipment.orderId,
          );

          if (carried.length === 0) {
            throw new ConflictException('That shipment carried nothing');
          }

          const unpriced = carried.filter((line) => line.unitPrice === null);
          if (unpriced.length > 0) {
            throw new ConflictException(
              `${unpriced.map((line) => line.sku).join(', ')} ${
                unpriced.length === 1 ? 'has' : 'have'
              } no price on the order — price the order line before invoicing`,
            );
          }

          const currencies = [...new Set(carried.map((line) => line.currency))];
          if (currencies.length !== 1 || !currencies[0]) {
            throw new ConflictException(
              'An invoice is in one currency, and this shipment carried items in more than one',
            );
          }

          const [invoice] = await tx
            .insert(invoices)
            .values({
              organizationId,
              orderId: shipment.orderId,
              shipmentId: shipment.id,
              partnerId: shipment.partnerId,
              currency: currencies[0],
              createdBy: actorId,
            })
            .returning();

          const lines = await tx
            .insert(invoiceLines)
            .values(
              carried.map((line) => ({
                organizationId,
                invoiceId: invoice.id,
                orderLineId: line.orderLineId,
                variantId: line.variantId,
                sku: line.sku,
                description: itemName(line.productName, line.variantName),
                quantity: line.quantity,
                // Checked non-null above; the filter does not narrow the type.
                unitPrice: line.unitPrice as string,
                taxCodeId: input.taxCodeId ?? null,
              })),
            )
            .returning();

          return { ...invoice, lines };
        },
      );

      this.logger.log(
        `Invoice draft ${created.id} created for shipment ${input.shipmentId}`,
      );
      return created;
    } catch (error) {
      if (isUniqueViolation(error, 'invoices_shipment_standing_key')) {
        throw new ConflictException(
          'That shipment already has an invoice — void it before billing the shipment again',
        );
      }
      throw error;
    }
  }

  async update(invoiceId: string, input: UpdateInvoiceDto) {
    if (input.taxCodeId) await this.assertUsableTaxCode(input.taxCodeId);

    await this.tenantDb.transaction(async (tx, organizationId) => {
      const invoice = await lockDraft(tx, organizationId, invoiceId);

      recordPrevious({ dueDate: invoice.dueDate });

      /**
       * Built from what was sent, not spread from the DTO: every declared
       * field exists on the instance as undefined, and Drizzle refuses an
       * update with nothing to set. Empty clears, as a cleared form field
       * arrives as "".
       */
      const fields = {
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate || null }
          : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      };

      if (Object.keys(fields).length > 0) {
        await tx
          .update(invoices)
          .set(fields)
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              eq(invoices.id, invoiceId),
            ),
          );
      }

      if (input.taxCodeId) {
        await tx
          .update(invoiceLines)
          .set({ taxCodeId: input.taxCodeId })
          .where(
            and(
              eq(invoiceLines.organizationId, organizationId),
              eq(invoiceLines.invoiceId, invoiceId),
            ),
          );
      }
    });
  }

  async updateLine(
    invoiceId: string,
    lineId: string,
    input: UpdateInvoiceLineDto,
  ) {
    if (input.taxCodeId) await this.assertUsableTaxCode(input.taxCodeId);

    await this.tenantDb.transaction(async (tx, organizationId) => {
      await lockDraft(tx, organizationId, invoiceId);

      // Both ids, so a line cannot be edited through another invoice's URL.
      const [line] = await tx
        .select()
        .from(invoiceLines)
        .where(
          and(
            eq(invoiceLines.organizationId, organizationId),
            eq(invoiceLines.invoiceId, invoiceId),
            eq(invoiceLines.id, lineId),
          ),
        );

      if (!line) throw new NotFoundException('No such line on this invoice');

      recordPrevious({
        sku: line.sku,
        unitPrice: line.unitPrice,
        taxCodeId: line.taxCodeId,
      });

      const fields = {
        ...(input.unitPrice !== undefined
          ? { unitPrice: input.unitPrice }
          : {}),
        ...(input.taxCodeId !== undefined
          ? { taxCodeId: input.taxCodeId }
          : {}),
      };

      if (Object.keys(fields).length === 0) return;

      await tx
        .update(invoiceLines)
        .set(fields)
        .where(
          and(
            eq(invoiceLines.organizationId, organizationId),
            eq(invoiceLines.id, lineId),
          ),
        );
    });
  }

  /**
   * A draft is deleted outright: nobody outside has seen it, it has no
   * number, and deleting it leaves no gap. Its lines go with it (CASCADE).
   */
  async delete(invoiceId: string) {
    await this.tenantDb.transaction(async (tx, organizationId) => {
      await lockDraft(tx, organizationId, invoiceId);

      await tx
        .delete(invoices)
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.id, invoiceId),
          ),
        );
    });

    this.logger.log(`Invoice draft ${invoiceId} deleted`);
  }

  /**
   * What the shipment carried, per order line: the sum of its `shipment`
   * movements, which are per lot. An order has one line per variant
   * (ADR-027), so the variant finds the line.
   */
  private carriedBy(
    tx: Transaction,
    organizationId: string,
    shipmentId: string,
    orderId: string,
  ) {
    return (
      tx
        .select({
          orderLineId: orderLines.id,
          variantId: orderLines.variantId,
          sku: orderLines.sku,
          unitPrice: orderLines.unitPrice,
          currency: orderLines.currency,
          productName: products.name,
          variantName: productVariants.name,
          quantity: sql<string>`sum(${stockMovements.quantity})::text`,
        })
        .from(stockMovements)
        .innerJoin(
          orderLines,
          and(
            eq(orderLines.orderId, orderId),
            eq(orderLines.variantId, stockMovements.variantId),
          ),
        )
        .innerJoin(
          productVariants,
          eq(productVariants.id, orderLines.variantId),
        )
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(
          and(
            eq(stockMovements.organizationId, organizationId),
            eq(stockMovements.referenceType, 'shipment'),
            eq(stockMovements.referenceId, shipmentId),
            eq(stockMovements.reason, 'shipment'),
          ),
        )
        // Grouped by primary keys, so their other columns may be selected.
        .groupBy(orderLines.id, productVariants.id, products.id)
        .orderBy(asc(orderLines.sku))
    );
  }

  /**
   * A code in this tenant, and still in use. Not found is a 400: the id
   * came in a body, as a partner from another organization does.
   */
  private async assertUsableTaxCode(taxCodeId: string) {
    const code = await this.taxCodes
      .findById(taxCodeId)
      .catch((error: unknown) => {
        if (error instanceof NotFoundException) {
          throw new BadRequestException('No such tax code');
        }
        throw error;
      });

    if (!code.isActive) {
      throw new ConflictException(
        `${code.name} is retired — choose a code still in use`,
      );
    }
  }
}
