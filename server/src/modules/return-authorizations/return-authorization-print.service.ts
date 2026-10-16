import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

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
  invoices,
  orders,
  partners,
  returnAuthorizationLines,
  returnAuthorizations,
  type ReturnAuthorizationStatus,
  type ReturnResolution,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { namedLines } from '../invoices/line-names';

/** A return authorization as drawn (ADR-071), read as it stands today. */
export interface ReturnAuthorizationPrint {
  number: string;
  status: ReturnAuthorizationStatus;
  createdAt: Date;
  orderNumber: string;
  invoiceNumber: string | null;
  reason: string;
  expectsGoods: boolean;
  note: string | null;
  language: Locale;
  secondLanguage: Locale | null;
  seller: Seller;
  customerName: string;
  customerAddress: PrintedAddress | null;
  /** Where the goods come back to; null prints the registered address. */
  sendBackTo: PrintedSite | null;
  lines: {
    sku: string;
    description: string;
    secondDescription: string | null;
    quantity: string;
    resolution: ReturnResolution;
  }[];
  raisedBy: RaisedBy | null;
}

/**
 * Reads an RMA for its PDF (ADR-071, amended): its number to write on the
 * box, the customer, what may come back and what happens to each item,
 * where to send it, and who to call. Item names in the customer's
 * languages, by the order lines they came from.
 */
@Injectable()
export class ReturnAuthorizationPrintService {
  constructor(private readonly tenantDb: TenantDb) {}

  async read(returnAuthorizationId: string): Promise<ReturnAuthorizationPrint> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          rma: returnAuthorizations,
          orderNumber: orders.number,
          invoiceNumber: invoices.number,
          customerName: partners.name,
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
      if (!row) {
        throw new NotFoundException(
          t({
            id: 'rmas.suchReturnAuthorization',
            defaultMessage: 'No such return authorization',
          }),
        );
      }
      const { rma } = row;

      const lines = await tx
        .select({
          orderLineId: returnAuthorizationLines.orderLineId,
          sku: returnAuthorizationLines.sku,
          quantity: returnAuthorizationLines.quantity,
          resolution: returnAuthorizationLines.resolution,
        })
        .from(returnAuthorizationLines)
        .where(
          and(
            eq(returnAuthorizationLines.organizationId, organizationId),
            eq(returnAuthorizationLines.returnAuthorizationId, rma.id),
          ),
        )
        .orderBy(asc(returnAuthorizationLines.sku));

      const languages = await documentLanguages(
        tx,
        organizationId,
        rma.partnerId,
      );
      // Its own lines only: what it returns is what it names.
      const names = await namedLines(
        tx,
        organizationId,
        rma.orderId,
        languages,
        'order',
        lines.map((line) => line.orderLineId),
      );

      return {
        number: rma.number,
        status: rma.status,
        createdAt: rma.createdAt,
        orderNumber: row.orderNumber,
        invoiceNumber: row.invoiceNumber,
        reason: rma.reason,
        expectsGoods: rma.expectsGoods,
        note: rma.note,
        language: languages.language,
        secondLanguage: languages.secondLanguage,
        seller: await sellerOf(tx, organizationId),
        customerName: row.customerName,
        customerAddress: await partnerAddress(
          tx,
          organizationId,
          rma.partnerId,
          true,
        ),
        sendBackTo: await siteOf(tx, organizationId, rma.sendBackToId),
        lines: lines.map((line) => ({
          sku: line.sku,
          description: names.get(line.orderLineId)?.description ?? line.sku,
          secondDescription:
            names.get(line.orderLineId)?.secondDescription ?? null,
          quantity: line.quantity,
          resolution: line.resolution,
        })),
        raisedBy: await raisedBy(tx, organizationId, rma.createdBy),
      };
    });
  }
}
