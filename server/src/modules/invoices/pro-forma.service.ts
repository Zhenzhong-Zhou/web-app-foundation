import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import {
  partnerAddress,
  type PrintedAddress,
  type Seller,
  sellerOf,
} from '../../core/documents/parties';
import type { SheetLine } from '../../core/documents/sheet';
import { documentLanguages } from '../../core/organizations/document-languages';
import { orderLines, orders, partners, taxCodes } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { type InvoiceAmounts, proFormaAmounts } from './invoice-amounts';
import { namedLines } from './line-names';

/** A pro forma as drawn: the order as it stands, valued as billed. */
export interface ProForma {
  orderId: string;
  orderNumber: string;
  /** The customer's reference, which they will look for. */
  orderReference: string | null;
  madeAt: Date;
  currency: string;
  language: Locale;
  secondLanguage: Locale | null;
  seller: Seller;
  customerName: string;
  billTo: PrintedAddress | null;
  shipTo: (PrintedAddress & { label: string | null }) | null;
  lines: SheetLine[];
  amounts: InvoiceAmounts;
}

/**
 * The pro forma invoice (ADR-071): made on demand from a sale that is not
 * cancelled, every line priced, valued by the invoice's own calculation.
 * Stored nowhere and numbered by nothing but its order: making it again
 * shows the order as it is then. The route records each one made.
 */
@Injectable()
export class ProFormaService {
  constructor(private readonly tenantDb: TenantDb) {}

  async make(orderId: string, taxCodeId: string | null): Promise<ProForma> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      // Read, not locked: nothing is written.
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, organizationId),
            eq(orders.id, orderId),
          ),
        );
      if (!order) {
        throw new NotFoundException(
          t({ id: 'orders.suchOrder', defaultMessage: 'No such order' }),
        );
      }

      if (order.direction !== 'sale') {
        throw new BadRequestException(
          t({
            id: 'invoices.proForma.sale',
            defaultMessage:
              'A pro forma is for a sale. A purchase prints as a purchase order.',
          }),
        );
      }

      let taxCodeName: string | null = null;
      if (taxCodeId) {
        const [code] = await tx
          .select({ name: taxCodes.name, isActive: taxCodes.isActive })
          .from(taxCodes)
          .where(
            and(
              eq(taxCodes.organizationId, organizationId),
              eq(taxCodes.id, taxCodeId),
            ),
          );
        if (!code) {
          throw new BadRequestException(
            t({
              id: 'invoices.proForma.unknownTaxCode',
              defaultMessage: 'Unknown tax code',
            }),
          );
        }
        if (!code.isActive) {
          throw new ConflictException(
            t(
              {
                id: 'invoices.proForma.taxCodeRetired',
                defaultMessage: '{name} is retired',
              },
              { name: code.name },
            ),
          );
        }
        taxCodeName = code.name;
      }

      // Declared values come with customs details (deferred in ADR-071).
      if (order.isSample) {
        throw new ConflictException(
          t({
            id: 'invoices.proForma.sample',
            defaultMessage:
              'A sample has no prices, so it has no pro forma yet',
          }),
        );
      }

      if (order.status === 'cancelled') {
        throw new ConflictException(
          t(
            {
              id: 'invoices.proForma.cancelled',
              defaultMessage: '{number} is cancelled, so it has no pro forma',
            },
            { number: order.number },
          ),
        );
      }

      const lines = await tx
        .select({
          id: orderLines.id,
          sku: orderLines.sku,
          quantity: orderLines.quantityOrdered,
          unitPrice: orderLines.unitPrice,
          currency: orderLines.currency,
        })
        .from(orderLines)
        .where(
          and(
            eq(orderLines.organizationId, organizationId),
            eq(orderLines.orderId, order.id),
          ),
        )
        .orderBy(asc(orderLines.sku));

      // As confirming refuses, with what to do (ADR-046).
      const unpriced = lines.filter((line) => line.unitPrice === null);
      if (unpriced.length > 0) {
        throw new ConflictException(
          t(
            {
              id: 'invoices.proForma.unpriced',
              defaultMessage:
                'Every item needs a price for a pro forma. {skus} {count, plural, one {has} other {have}} none: price {count, plural, one {it} other {them}} on the order, then make it again',
            },
            {
              skus: unpriced.map((line) => line.sku).join(', '),
              count: unpriced.length,
            },
          ),
        );
      }

      const currencies = [...new Set(lines.map((line) => line.currency))];
      if (currencies.length !== 1 || !currencies[0]) {
        throw new ConflictException(
          t(
            {
              id: 'invoices.proForma.oneCurrency',
              defaultMessage:
                'A pro forma is in one currency, and this order has {currencies}. Price every item in one of them',
            },
            { currencies: currencies.filter(Boolean).join(', ') },
          ),
        );
      }
      const currency = currencies[0];

      const languages = await documentLanguages(
        tx,
        organizationId,
        order.partnerId,
      );
      // One after another: a transaction is one connection.
      const names = await namedLines(
        tx,
        organizationId,
        order.id,
        languages,
        'order',
      );
      const amounts = await proFormaAmounts(
        tx,
        organizationId,
        order.id,
        currency,
        taxCodeId,
      );
      const seller = await sellerOf(tx, organizationId);
      const billTo = await partnerAddress(
        tx,
        organizationId,
        order.partnerId,
        true,
      );
      const [partner] = await tx
        .select({ name: partners.name })
        .from(partners)
        .where(
          and(
            eq(partners.organizationId, organizationId),
            eq(partners.id, order.partnerId),
          ),
        );
      const netOf = new Map(
        amounts.lines.map((line) => [line.id, line.netAmount]),
      );

      return {
        orderId: order.id,
        orderNumber: order.number,
        orderReference: order.reference,
        madeAt: new Date(),
        currency,
        language: languages.language,
        secondLanguage: languages.secondLanguage,
        seller,
        customerName: partner?.name ?? '',
        billTo,
        // The order's own snapshot, as the invoice copies it (ADR-035).
        shipTo: order.shipToLine1
          ? {
              label: order.shipToLabel,
              line1: order.shipToLine1,
              line2: order.shipToLine2,
              city: order.shipToCity,
              region: order.shipToRegion,
              postalCode: order.shipToPostalCode,
              country: order.shipToCountry,
            }
          : null,
        lines: lines.map((line) => ({
          sku: line.sku,
          description: names.get(line.id)?.description ?? line.sku,
          secondDescription: names.get(line.id)?.secondDescription ?? null,
          quantity: line.quantity,
          // Checked non-null above; the filter does not narrow the type.
          unitPrice: line.unitPrice as string,
          taxCodeName,
          netAmount: netOf.get(line.id) ?? null,
        })),
        amounts,
      };
    });
  }
}
