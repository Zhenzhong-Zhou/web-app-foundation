import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import {
  partnerAddress,
  type PrintedAddress,
  type PrintedSite,
  type RaisedBy,
  raisedBy,
  type Seller,
  sellerOf,
  siteOf,
} from '../../core/documents/parties';
import { documentLanguages } from '../../core/organizations/document-languages';
import {
  orderLines,
  type OrderStatus,
  partners,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { minorUnits } from '../invoices/invoice-amounts';
import { namedLines } from '../invoices/line-names';
import type { Tx } from '../stock/stock.service';
import { loadOrder } from './load-order';

/** One line as the purchase order prints it; unpriced ones print blank. */
export interface PurchaseOrderLine {
  sku: string;
  description: string;
  secondDescription: string | null;
  quantity: string;
  unitOfMeasure: string;
  unitPrice: string | null;
  currency: string | null;
  /** Quantity × price in minor units, as an invoice rounds it. */
  amount: string | null;
}

/** A purchase order as drawn (ADR-071), read as it stands today. */
export interface PurchaseOrderPrint {
  number: string;
  status: OrderStatus;
  createdAt: Date;
  /** Deliver by: the day the goods are expected (ADR-052). */
  expectedAt: string | null;
  /** The supplier's reference for it, when they gave one. */
  reference: string | null;
  note: string | null;
  language: Locale;
  secondLanguage: Locale | null;
  seller: Seller;
  supplierName: string;
  supplierAddress: PrintedAddress | null;
  deliverTo: PrintedSite | null;
  lines: PurchaseOrderLine[];
  /** One total per currency the priced lines are in, before tax. */
  totals: { currency: string; amount: string }[];
  raisedBy: RaisedBy | null;
}

/**
 * Reads a purchase order for its PDF (ADR-071, amended): the order, the
 * supplier, where it is delivered, each line priced or not, and who raised
 * it. A purchase is sometimes raised before its price is known (ADR-046),
 * so an unpriced line is printed blank and the total counts priced lines
 * only, in each currency they are in, worked out in SQL (ADR-025).
 */
@Injectable()
export class PurchaseOrderPrintService {
  constructor(private readonly tenantDb: TenantDb) {}

  async read(orderId: string): Promise<PurchaseOrderPrint> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      // Read, not locked: nothing is written.
      const order = await loadOrder(tx, organizationId, orderId, {
        lock: false,
      });
      if (order.direction !== 'purchase') {
        throw new BadRequestException(
          t({
            id: 'orders.print.purchaseOnly',
            defaultMessage:
              'Only a purchase prints as a purchase order. A sale prints a pro forma invoice.',
          }),
        );
      }

      const rows = await tx
        .select({
          id: orderLines.id,
          sku: orderLines.sku,
          quantity: orderLines.quantityOrdered,
          unitPrice: orderLines.unitPrice,
          currency: orderLines.currency,
          unitOfMeasure: productVariants.unitOfMeasure,
        })
        .from(orderLines)
        .innerJoin(
          productVariants,
          eq(productVariants.id, orderLines.variantId),
        )
        .where(
          and(
            eq(orderLines.organizationId, organizationId),
            eq(orderLines.orderId, order.id),
          ),
        )
        .orderBy(asc(orderLines.sku));

      const { amounts, totals } = await this.amounts(
        tx,
        organizationId,
        order.id,
        rows,
      );
      const languages = await documentLanguages(
        tx,
        organizationId,
        order.partnerId,
      );
      const names = await namedLines(
        tx,
        organizationId,
        order.id,
        languages,
        'order',
      );
      const [supplier] = await tx
        .select({ name: partners.name })
        .from(partners)
        .where(
          and(
            eq(partners.organizationId, organizationId),
            eq(partners.id, order.partnerId),
          ),
        );

      return {
        number: order.number,
        status: order.status,
        createdAt: order.createdAt,
        expectedAt: order.expectedAt,
        reference: order.reference,
        note: order.note,
        language: languages.language,
        secondLanguage: languages.secondLanguage,
        seller: await sellerOf(tx, organizationId),
        supplierName: supplier?.name ?? '',
        supplierAddress: await partnerAddress(
          tx,
          organizationId,
          order.partnerId,
          false,
        ),
        deliverTo: await siteOf(tx, organizationId, order.deliverToId),
        lines: rows.map((row) => ({
          sku: row.sku,
          description: names.get(row.id)?.description ?? row.sku,
          secondDescription: names.get(row.id)?.secondDescription ?? null,
          quantity: row.quantity,
          unitOfMeasure: row.unitOfMeasure,
          unitPrice: row.unitPrice,
          currency: row.currency,
          amount: amounts.get(row.id) ?? null,
        })),
        totals,
        raisedBy: await raisedBy(tx, organizationId, order.createdBy),
      };
    });
  }

  /**
   * Each priced line's amount and each currency's total, rounded to that
   * currency's minor units line by line, as an invoice rounds them.
   */
  private async amounts(
    tx: Tx,
    organizationId: string,
    orderId: string,
    rows: { currency: string | null; unitPrice: string | null }[],
  ) {
    const currencies = [
      ...new Set(
        rows
          .filter((row) => row.unitPrice !== null && row.currency)
          .map((row) => row.currency as string),
      ),
    ];
    if (currencies.length === 0) {
      return { amounts: new Map<string, string>(), totals: [] };
    }

    const places = sql.join(
      currencies.map(
        (currency) => sql`(${currency}::text, ${minorUnits(currency)}::int)`,
      ),
      sql`, `,
    );
    const priced = sql`
      select l.id, l.currency, round(l.quantity_ordered * l.unit_price, p.places) as amount
      from order_lines l
      join (values ${places}) as p (currency, places)
        on p.currency = l.currency
      where l.organization_id = ${organizationId}::uuid
        and l.order_id = ${orderId}::uuid
        and l.unit_price is not null
    `;

    const lines = await tx.execute<{ id: string; amount: string }>(sql`
      select x.id, x.amount::numeric(18, 4)::text as amount
      from (${priced}) x
    `);
    const totals = await tx.execute<{ currency: string; amount: string }>(sql`
      select x.currency, sum(x.amount)::numeric(18, 4)::text as amount
      from (${priced}) x
      group by x.currency
      order by x.currency
    `);

    return {
      amounts: new Map(lines.rows.map((row) => [row.id, row.amount])),
      totals: totals.rows,
    };
  }
}
