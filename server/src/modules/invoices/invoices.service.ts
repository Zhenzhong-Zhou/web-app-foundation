import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, or, sql } from 'drizzle-orm';

import { calendarRange } from '../../common/date-range';
import { pageOf } from '../../common/keyset';
import { codeMatches, searchTerms } from '../../common/search';
import { pagedBy } from '../../common/sorted-page';
import { documentLanguages } from '../../core/organizations/document-languages';
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
import { t } from '../../i18n/translate';
import { partnerMatches } from '../partners/partner-search';
import type { ListCreditNotesDto } from './dto/list-credit-notes.dto';
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

      // Newest first, or sorted (ADR-057), paged after the cursor either way.
      const paging = await pagedBy({
        id: invoices.id,
        before: query.before,
        sorted: query.sort
          ? {
              value: {
                invoiceDate: invoices.invoiceDate,
                total: invoices.total,
              }[query.sort],
              order: query.order ?? 'asc',
            }
          : undefined,
        readCursor: async (before) => {
          const column = query.sort
            ? { invoiceDate: invoices.invoiceDate, total: invoices.total }[
                query.sort
              ]
            : invoices.id;
          const [row] = await tx
            .select({
              value: sql<string | null>`${column}::text`,
              id: invoices.id,
            })
            .from(invoices)
            .where(
              and(
                eq(invoices.organizationId, organizationId),
                eq(invoices.id, before),
              ),
            );
          return row;
        },
      });
      if (paging.where) scope.push(paging.where);
      if (query.status) scope.push(eq(invoices.status, query.status));
      if (query.partnerId) scope.push(eq(invoices.partnerId, query.partnerId));
      if (query.orderId) scope.push(eq(invoices.orderId, query.orderId));
      // By invoice date (ADR-057); a draft has none yet, so a range leaves
      // drafts out.
      scope.push(...calendarRange(invoices.invoiceDate, query));
      // Its number or its partner's name (ADR-056). A draft has no number
      // yet, so only its partner finds it.
      if (query.search) {
        const terms = searchTerms(query.search);
        const match = or(
          codeMatches(invoices.number, terms),
          partnerMatches(invoices.partnerId, terms),
        );
        if (match) scope.push(match);
      }

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
        // By id (UUIDv7 is chronological), or by the sort and then id.
        .orderBy(...paging.orderBy)
        .limit(limit + 1);

      return pageOf(rows, limit);
    });
  }

  /**
   * Every credit note, newest first (ADR-057): they had pages but no list,
   * so a quarter's could be neither shown nor exported. Each with its
   * invoice's number and its partner, for the row and the export.
   */
  async listCreditNotes(query: ListCreditNotesDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(creditNotes.organizationId, organizationId)];

      // Newest first, or sorted (ADR-057), paged after the cursor either way.
      const paging = await pagedBy({
        id: creditNotes.id,
        before: query.before,
        sorted: query.sort
          ? {
              value: {
                creditDate: creditNotes.creditDate,
                total: creditNotes.total,
              }[query.sort],
              order: query.order ?? 'asc',
            }
          : undefined,
        readCursor: async (before) => {
          const column = query.sort
            ? { creditDate: creditNotes.creditDate, total: creditNotes.total }[
                query.sort
              ]
            : creditNotes.id;
          const [row] = await tx
            .select({
              value: sql<string | null>`${column}::text`,
              id: creditNotes.id,
            })
            .from(creditNotes)
            .where(
              and(
                eq(creditNotes.organizationId, organizationId),
                eq(creditNotes.id, before),
              ),
            );
          return row;
        },
      });
      if (paging.where) scope.push(paging.where);
      if (query.partnerId) {
        scope.push(eq(creditNotes.partnerId, query.partnerId));
      }
      if (query.invoiceId) {
        scope.push(eq(creditNotes.invoiceId, query.invoiceId));
      }
      scope.push(...calendarRange(creditNotes.creditDate, query));
      if (query.search) {
        const terms = searchTerms(query.search);
        const match = or(
          codeMatches(creditNotes.number, terms),
          partnerMatches(creditNotes.partnerId, terms),
        );
        if (match) scope.push(match);
      }

      const rows = await tx
        .select({
          id: creditNotes.id,
          number: creditNotes.number,
          invoiceId: creditNotes.invoiceId,
          invoiceNumber: invoices.number,
          partnerId: creditNotes.partnerId,
          partnerName: partners.name,
          currency: invoices.currency,
          creditDate: creditNotes.creditDate,
          total: creditNotes.total,
          isVoid: creditNotes.isVoid,
        })
        .from(creditNotes)
        .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
        .innerJoin(partners, eq(partners.id, creditNotes.partnerId))
        .where(and(...scope))
        .orderBy(...paging.orderBy)
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

      if (!invoice)
        throw new NotFoundException(
          t({ id: 'invoices.suchInvoice', defaultMessage: 'No such invoice' }),
        );

      const lines = await tx
        .select({
          id: invoiceLines.id,
          orderLineId: invoiceLines.orderLineId,
          variantId: invoiceLines.variantId,
          sku: invoiceLines.sku,
          description: invoiceLines.description,
          // The name in the second language, copied at issue (ADR-054).
          secondDescription: invoiceLines.secondDescription,
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
          // Not stored until issue: a draft previews in the languages it
          // would take today, so its printout is what issuing would print.
          ...(await documentLanguages(
            tx,
            organizationId,
            invoice.invoice.partnerId,
          )),
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

      if (!row)
        throw new NotFoundException(
          t({
            id: 'invoices.suchCreditNote',
            defaultMessage: 'No such credit note',
          }),
        );

      const lines = await tx
        .select({
          id: creditNoteLines.id,
          invoiceLineId: creditNoteLines.invoiceLineId,
          sku: creditNoteLines.sku,
          description: creditNoteLines.description,
          secondDescription: creditNoteLines.secondDescription,
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
