import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import {
  creditNoteLines,
  creditNotes,
  creditNoteTaxes,
  invoiceLines,
  invoices,
  invoiceTaxes,
  orders,
  partners,
  taxCodes,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { ListInvoicesDto } from './dto/list-invoices.dto';
import { computeAmounts } from './invoice-amounts';

const DEFAULT_LIMIT = 50;

/**
 * Invoices (ADR-046): drafts created from a shipment, edited, deleted, and
 * issued. Voiding follows in its own step.
 *
 * Every write locks the invoice row first. Issuing will take the same lock,
 * so a price changed while someone presses Issue either lands before the
 * issue reads it or is refused because the invoice is no longer a draft —
 * never half of each.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly tenantDb: TenantDb) {}

  async list(query: ListInvoicesDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(invoices.organizationId, organizationId)];

      if (query.before) scope.push(lt(invoices.id, query.before));
      if (query.status) scope.push(eq(invoices.status, query.status));
      if (query.partnerId) scope.push(eq(invoices.partnerId, query.partnerId));
      if (query.orderId) scope.push(eq(invoices.orderId, query.orderId));

      const rows = await tx
        .select({
          id: invoices.id,
          number: invoices.number,
          status: invoices.status,
          orderId: invoices.orderId,
          shipmentId: invoices.shipmentId,
          partnerId: invoices.partnerId,
          partnerName: partners.name,
          currency: invoices.currency,
          invoiceDate: invoices.invoiceDate,
          dueDate: invoices.dueDate,
          total: invoices.total,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .innerJoin(partners, eq(partners.id, invoices.partnerId))
        .where(and(...scope))
        // By id: UUIDv7 is chronological, so one column is the cursor.
        .orderBy(desc(invoices.id))
        .limit(limit + 1);

      return pageOf(rows, limit);
    });
  }

  async findById(invoiceId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [invoice] = await tx
        .select({
          invoice: invoices,
          partnerName: partners.name,
          orderReference: orders.reference,
        })
        .from(invoices)
        .innerJoin(partners, eq(partners.id, invoices.partnerId))
        .innerJoin(orders, eq(orders.id, invoices.orderId))
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            eq(invoices.id, invoiceId),
          ),
        );

      if (!invoice) throw new NotFoundException('No such invoice');

      const lines = await tx
        .select({
          id: invoiceLines.id,
          orderLineId: invoiceLines.orderLineId,
          variantId: invoiceLines.variantId,
          sku: invoiceLines.sku,
          description: invoiceLines.description,
          quantity: invoiceLines.quantity,
          unitPrice: invoiceLines.unitPrice,
          taxCodeId: invoiceLines.taxCodeId,
          // The live name on a draft; the copy made at issue after that.
          taxCodeName: sql<
            string | null
          >`coalesce(${invoiceLines.taxCodeName}, ${taxCodes.name})`,
          netAmount: invoiceLines.netAmount,
        })
        .from(invoiceLines)
        .leftJoin(taxCodes, eq(taxCodes.id, invoiceLines.taxCodeId))
        .where(
          and(
            eq(invoiceLines.organizationId, organizationId),
            eq(invoiceLines.invoiceId, invoiceId),
          ),
        )
        .orderBy(asc(invoiceLines.sku));

      // What has reversed it, in whole or in part: the invoice page's
      // answer to "is this still owed".
      const credits = await tx
        .select({
          id: creditNotes.id,
          number: creditNotes.number,
          creditDate: creditNotes.creditDate,
          reason: creditNotes.reason,
          isVoid: creditNotes.isVoid,
          total: creditNotes.total,
        })
        .from(creditNotes)
        .where(
          and(
            eq(creditNotes.organizationId, organizationId),
            eq(creditNotes.invoiceId, invoiceId),
          ),
        )
        .orderBy(asc(creditNotes.id));

      const base = {
        ...invoice.invoice,
        partnerName: invoice.partnerName,
        orderReference: invoice.orderReference,
        lines,
        creditNotes: credits,
      };

      /**
       * A draft shows what issuing would store, computed by the same
       * function, so the figures on screen are the figures that print. An
       * issued invoice shows what was stored, and computes nothing.
       */
      if (invoice.invoice.status === 'draft') {
        return {
          ...base,
          taxes: null,
          preview: await computeAmounts(
            tx,
            organizationId,
            invoiceId,
            invoice.invoice.currency,
          ),
        };
      }

      const taxes = await tx
        .select({
          name: invoiceTaxes.name,
          rate: invoiceTaxes.rate,
          taxableAmount: invoiceTaxes.taxableAmount,
          amount: invoiceTaxes.amount,
        })
        .from(invoiceTaxes)
        .where(
          and(
            eq(invoiceTaxes.organizationId, organizationId),
            eq(invoiceTaxes.invoiceId, invoiceId),
          ),
        )
        .orderBy(asc(invoiceTaxes.name), asc(invoiceTaxes.rate));

      return { ...base, taxes, preview: null };
    });
  }

  /** A credit note with its lines and tax lines, for reading and printing. */
  async findCreditNote(creditNoteId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          creditNote: creditNotes,
          invoiceNumber: invoices.number,
          invoiceDate: invoices.invoiceDate,
        })
        .from(creditNotes)
        .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
        .where(
          and(
            eq(creditNotes.organizationId, organizationId),
            eq(creditNotes.id, creditNoteId),
          ),
        );

      if (!row) throw new NotFoundException('No such credit note');

      const lines = await tx
        .select({
          id: creditNoteLines.id,
          invoiceLineId: creditNoteLines.invoiceLineId,
          sku: creditNoteLines.sku,
          description: creditNoteLines.description,
          quantity: creditNoteLines.quantity,
          unitPrice: creditNoteLines.unitPrice,
          taxCodeName: creditNoteLines.taxCodeName,
          netAmount: creditNoteLines.netAmount,
        })
        .from(creditNoteLines)
        .where(
          and(
            eq(creditNoteLines.organizationId, organizationId),
            eq(creditNoteLines.creditNoteId, creditNoteId),
          ),
        )
        .orderBy(asc(creditNoteLines.sku));

      const taxes = await tx
        .select({
          name: creditNoteTaxes.name,
          rate: creditNoteTaxes.rate,
          taxableAmount: creditNoteTaxes.taxableAmount,
          amount: creditNoteTaxes.amount,
        })
        .from(creditNoteTaxes)
        .where(
          and(
            eq(creditNoteTaxes.organizationId, organizationId),
            eq(creditNoteTaxes.creditNoteId, creditNoteId),
          ),
        )
        .orderBy(asc(creditNoteTaxes.name), asc(creditNoteTaxes.rate));

      return {
        ...row.creditNote,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        lines,
        taxes,
      };
    });
  }
}
