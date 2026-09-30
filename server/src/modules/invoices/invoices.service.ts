import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import { recordContext } from '../../core/audit/audit-context';
import { registeredAddress } from '../../core/organizations/registered-address';
import type { Transaction } from '../../database/database.module';
import { isCheckViolation } from '../../database/errors';
import {
  addresses,
  creditNoteLines,
  creditNotes,
  creditNoteTaxes,
  invoiceLines,
  invoiceLineTaxes,
  invoices,
  invoiceTaxes,
  orders,
  organizations,
  partners,
  taxCodeComponents,
  taxCodes,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { takeNumber } from './document-numbers';
import type { IssueInvoiceDto } from './dto/issue-invoice.dto';
import type { ListInvoicesDto } from './dto/list-invoices.dto';
import type { VoidInvoiceDto } from './dto/void-invoice.dto';
import { computeAmounts } from './invoice-amounts';
import { lockDraft } from './lock-draft';

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
  private readonly logger = new Logger(InvoicesService.name);

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

  /**
   * Issues a draft: numbers it, stores its amounts, copies both parties,
   * and freezes it (ADR-046). One transaction under the invoice's lock, so
   * a failure anywhere — including after the number is taken — rolls back
   * to the draft and gives the number back.
   *
   * Refusals come before any write, in order: the draft must exist (404)
   * and still be a draft (409); the due date must not precede the invoice
   * date (400); every line needs a tax code still in use, the organization
   * a registered address, and the customer a billing address (409).
   */
  async issue(invoiceId: string, input: IssueInvoiceDto, actorId: string) {
    try {
      const issued = await this.tenantDb.transaction(
        async (tx, organizationId) => {
          const invoice = await lockDraft(tx, organizationId, invoiceId);

          // Calendar days as YYYY-MM-DD compare correctly as strings.
          if (invoice.dueDate && invoice.dueDate < input.invoiceDate) {
            throw new BadRequestException(
              `The due date (${invoice.dueDate}) is before the invoice date`,
            );
          }

          await this.assertEveryLineTaxed(tx, organizationId, invoiceId);

          const seller = await this.seller(tx, organizationId);
          const billTo = await this.billTo(
            tx,
            organizationId,
            invoice.partnerId,
          );
          const shipTo = await this.shipTo(tx, organizationId, invoice.orderId);

          const amounts = await computeAmounts(
            tx,
            organizationId,
            invoiceId,
            invoice.currency,
          );

          /**
           * Per line, from the one calculation. A handful of lines per
           * shipment, so a statement each is simpler than an UPDATE ... FROM
           * and cannot compute a figure the preview did not.
           */
          for (const line of amounts.lines) {
            await tx
              .update(invoiceLines)
              .set({
                netAmount: line.netAmount,
                // Aliased plain SQL, as the other correlated subqueries are:
                // which table each column belongs to is written here, not
                // left to how Drizzle renders columns inside an update.
                taxCodeName: sql`(select tc.name from tax_codes tc where tc.id = ${invoiceLines.taxCodeId})`,
              })
              .where(
                and(
                  eq(invoiceLines.organizationId, organizationId),
                  eq(invoiceLines.id, line.id),
                ),
              );
          }

          /**
           * Which tax components applied to each line, at the rates charged
           * today (ADR-047). A partial credit weeks from now reads these,
           * never the code's current rates, which may have changed by law.
           * Read in this transaction, so they are exactly the components
           * computeAmounts just used.
           */
          await tx.execute(sql`
            insert into ${invoiceLineTaxes}
              (organization_id, invoice_line_id, name, rate)
            select ${organizationId}::uuid, l.id, c.name, c.rate
            from ${invoiceLines} l
            join ${taxCodeComponents} c
              on c.tax_code_id = l.tax_code_id
             and c.organization_id = ${organizationId}::uuid
            where l.organization_id = ${organizationId}::uuid
              and l.invoice_id = ${invoiceId}::uuid
          `);

          if (amounts.taxes.length > 0) {
            await tx.insert(invoiceTaxes).values(
              amounts.taxes.map((tax) => ({
                organizationId,
                invoiceId,
                name: tax.name,
                rate: tax.rate,
                taxableAmount: tax.taxableAmount,
                amount: tax.amount,
              })),
            );
          }

          // Last, so every refusal above leaves the series untouched.
          const number = await takeNumber(tx, organizationId, 'invoice');

          const [row] = await tx
            .update(invoices)
            .set({
              status: 'issued',
              number,
              invoiceDate: input.invoiceDate,
              issuedAt: new Date(),
              issuedBy: actorId,
              subtotal: amounts.subtotal,
              taxTotal: amounts.taxTotal,
              total: amounts.total,
              ...seller,
              ...billTo,
              ...shipTo,
            })
            .where(
              and(
                eq(invoices.organizationId, organizationId),
                eq(invoices.id, invoiceId),
              ),
            )
            .returning();

          return row;
        },
      );

      this.logger.log(`Invoice ${issued.id} issued as ${issued.number}`);
      return issued;
    } catch (error) {
      // Checked above; this is the database saying so if that ever drifts.
      if (isCheckViolation(error, 'invoices_due_after_issue_check')) {
        throw new BadRequestException(
          'The due date is before the invoice date',
        );
      }
      throw error;
    }
  }

  /**
   * Voids an issued invoice by issuing a credit note for the whole of it,
   * in one transaction (ADR-046). Nothing is deleted: both documents stay
   * and print, and the credit note names the invoice it reverses.
   *
   * Voiding frees the shipment — the standing-invoice index ignores voided
   * invoices — so it can be invoiced again or itself voided.
   *
   * The credit note copies the invoice rather than recomputing: its lines,
   * amounts and tax lines are the invoice's, so the two cancel to the cent
   * whatever has changed in tax codes or rounding since.
   */
  async void(invoiceId: string, input: VoidInvoiceDto, actorId: string) {
    const result = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const [invoice] = await tx
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              eq(invoices.id, invoiceId),
            ),
          )
          .for('update');

        if (!invoice) throw new NotFoundException('No such invoice');

        if (invoice.status === 'draft') {
          throw new ConflictException(
            'A draft is deleted, not voided — nobody outside has seen it',
          );
        }

        if (invoice.status === 'voided') {
          throw new ConflictException('That invoice has already been voided');
        }

        /**
         * A void credits the whole invoice, so once part of it has been
         * credited (ADR-047) a void would credit that part twice. The rest
         * is credited instead, and the value caps stop it at what was billed.
         */
        const [partial] = await tx
          .select({ number: creditNotes.number })
          .from(creditNotes)
          .where(
            and(
              eq(creditNotes.organizationId, organizationId),
              eq(creditNotes.invoiceId, invoiceId),
            ),
          )
          .limit(1);

        if (partial) {
          throw new ConflictException(
            `${partial.number} already credits part of this invoice — credit what remains instead of voiding it, so nothing is credited twice`,
          );
        }

        const issuedOn = stored(invoice.invoiceDate, 'invoice date');

        // Calendar days as YYYY-MM-DD compare correctly as strings.
        if (input.creditDate < issuedOn) {
          throw new BadRequestException(
            `A credit note cannot be dated before the invoice it reverses (${issuedOn})`,
          );
        }

        const lines = await tx
          .select()
          .from(invoiceLines)
          .where(
            and(
              eq(invoiceLines.organizationId, organizationId),
              eq(invoiceLines.invoiceId, invoiceId),
            ),
          )
          .orderBy(asc(invoiceLines.sku));

        const taxes = await tx
          .select()
          .from(invoiceTaxes)
          .where(
            and(
              eq(invoiceTaxes.organizationId, organizationId),
              eq(invoiceTaxes.invoiceId, invoiceId),
            ),
          );

        // After every refusal, so a refused void leaves no gap in the series.
        const number = await takeNumber(tx, organizationId, 'credit_note');

        const [creditNote] = await tx
          .insert(creditNotes)
          .values({
            organizationId,
            invoiceId,
            partnerId: invoice.partnerId,
            number,
            currency: invoice.currency,
            creditDate: input.creditDate,
            reason: input.reason,
            isVoid: true,
            subtotal: stored(invoice.subtotal, 'subtotal'),
            taxTotal: stored(invoice.taxTotal, 'tax total'),
            total: stored(invoice.total, 'total'),
            sellerName: invoice.sellerName,
            sellerTaxNumber: invoice.sellerTaxNumber,
            sellerLine1: invoice.sellerLine1,
            sellerLine2: invoice.sellerLine2,
            sellerCity: invoice.sellerCity,
            sellerRegion: invoice.sellerRegion,
            sellerPostalCode: invoice.sellerPostalCode,
            sellerCountry: invoice.sellerCountry,
            billToAddressId: invoice.billToAddressId,
            billToName: invoice.billToName,
            billToLine1: invoice.billToLine1,
            billToLine2: invoice.billToLine2,
            billToCity: invoice.billToCity,
            billToRegion: invoice.billToRegion,
            billToPostalCode: invoice.billToPostalCode,
            billToCountry: invoice.billToCountry,
            createdBy: actorId,
          })
          .returning();

        await tx.insert(creditNoteLines).values(
          lines.map((line) => ({
            organizationId,
            creditNoteId: creditNote.id,
            invoiceLineId: line.id,
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxCodeName: line.taxCodeName,
            netAmount: stored(line.netAmount, `net amount of ${line.sku}`),
          })),
        );

        if (taxes.length > 0) {
          await tx.insert(creditNoteTaxes).values(
            taxes.map((tax) => ({
              organizationId,
              creditNoteId: creditNote.id,
              name: tax.name,
              rate: tax.rate,
              taxableAmount: tax.taxableAmount,
              amount: tax.amount,
            })),
          );
        }

        const [voided] = await tx
          .update(invoices)
          .set({
            status: 'voided',
            voidedAt: new Date(),
            voidedBy: actorId,
            voidReason: input.reason,
          })
          .where(
            and(
              eq(invoices.organizationId, organizationId),
              eq(invoices.id, invoiceId),
            ),
          )
          .returning();

        // The credit note's number, for History. The reason stays on the
        // documents: free text is kept out of a two-year table (ADR-018).
        recordContext({ creditNote: number });

        return { invoice: voided, creditNote };
      },
    );

    this.logger.log(
      `Invoice ${result.invoice.number} voided by ${result.creditNote.number}`,
    );
    return result;
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

  /**
   * "No tax" is the Exempt code, never a blank (ADR-046), and a retired
   * code is one the organization no longer charges.
   */
  private async assertEveryLineTaxed(
    tx: Transaction,
    organizationId: string,
    invoiceId: string,
  ) {
    const lines = await tx
      .select({
        sku: invoiceLines.sku,
        taxCodeId: invoiceLines.taxCodeId,
        taxCodeName: taxCodes.name,
        taxCodeActive: taxCodes.isActive,
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

    const untaxed = lines.filter((line) => !line.taxCodeId);
    if (untaxed.length > 0) {
      throw new ConflictException(
        `${untaxed.map((line) => line.sku).join(', ')} ${
          untaxed.length === 1 ? 'has' : 'have'
        } no tax code — choose one, or Exempt`,
      );
    }

    const retired = lines.filter((line) => line.taxCodeActive === false);
    if (retired.length > 0) {
      const names = [...new Set(retired.map((line) => line.taxCodeName))];
      throw new ConflictException(
        `${names.join(', ')} ${
          names.length === 1 ? 'is' : 'are'
        } retired — choose a code still in use`,
      );
    }
  }

  /** Who issued it: the organization's name, tax number and address. */
  private async seller(tx: Transaction, organizationId: string) {
    const [organization] = await tx
      .select({
        name: organizations.name,
        taxRegistrationNumber: organizations.taxRegistrationNumber,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    const address = await registeredAddress(tx, organizationId);

    if (!address) {
      throw new ConflictException(
        'Set the organization’s registered address before issuing — every invoice prints it',
      );
    }

    return {
      sellerName: organization.name,
      sellerTaxNumber: organization.taxRegistrationNumber,
      sellerLine1: address.line1,
      sellerLine2: address.line2,
      sellerCity: address.city,
      sellerRegion: address.region,
      sellerPostalCode: address.postalCode,
      sellerCountry: address.country,
    };
  }

  /**
   * Who pays: the customer's default billing address, or else any active
   * billing address, oldest first, so the choice is stable between calls.
   */
  private async billTo(
    tx: Transaction,
    organizationId: string,
    partnerId: string,
  ) {
    const [row] = await tx
      .select({ partnerName: partners.name, address: addresses })
      .from(addresses)
      .innerJoin(partners, eq(partners.id, addresses.partnerId))
      .where(
        and(
          eq(addresses.organizationId, organizationId),
          eq(addresses.partnerId, partnerId),
          eq(addresses.isBilling, true),
          eq(addresses.isActive, true),
        ),
      )
      .orderBy(desc(addresses.isDefault), asc(addresses.createdAt))
      .limit(1);

    if (!row) {
      const [partner] = await tx
        .select({ name: partners.name })
        .from(partners)
        .where(
          and(
            eq(partners.organizationId, organizationId),
            eq(partners.id, partnerId),
          ),
        );

      throw new ConflictException(
        `${partner?.name ?? 'This customer'} has no billing address — add one before issuing`,
      );
    }

    return {
      billToAddressId: row.address.id,
      billToName: row.partnerName,
      billToLine1: row.address.line1,
      billToLine2: row.address.line2,
      billToCity: row.address.city,
      billToRegion: row.address.region,
      billToPostalCode: row.address.postalCode,
      billToCountry: row.address.country,
    };
  }

  /** Where the goods went, copied from the order's own snapshot. */
  private async shipTo(
    tx: Transaction,
    organizationId: string,
    orderId: string,
  ) {
    const [order] = await tx
      .select({
        shipToLabel: orders.shipToLabel,
        shipToLine1: orders.shipToLine1,
        shipToLine2: orders.shipToLine2,
        shipToCity: orders.shipToCity,
        shipToRegion: orders.shipToRegion,
        shipToPostalCode: orders.shipToPostalCode,
        shipToCountry: orders.shipToCountry,
      })
      .from(orders)
      .where(
        and(eq(orders.organizationId, organizationId), eq(orders.id, orderId)),
      );

    return order;
  }
}

/**
 * A value an issued invoice always has — its check constraint guarantees
 * it — read from a column typed nullable because drafts leave it empty.
 * Throws rather than inventing a figure if that guarantee is ever broken.
 */
function stored<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new InternalServerErrorException(
      `An issued invoice is missing its ${what}`,
    );
  }
  return value;
}
