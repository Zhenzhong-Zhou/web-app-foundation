import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { documentLanguages } from '../../core/organizations/document-languages';
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
import type { VoidInvoiceDto } from './dto/void-invoice.dto';
import { computeAmounts } from './invoice-amounts';
import { languagesOf, partiesOf, stored } from './issued-invoice';
import { lockDraft } from './lock-draft';

/**
 * An invoice leaving draft (ADR-046): issuing it, with the numbers and the
 * seller and customer it will carry for good, and voiding it, which is a
 * full credit note under the same rules as a partial one. InvoicesService
 * reads invoices; InvoiceDraftsService edits them before this.
 */
@Injectable()
export class InvoiceIssuingService {
  private readonly logger = new Logger(InvoiceIssuingService.name);

  constructor(private readonly tenantDb: TenantDb) {}

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
          // Resolved now, not at draft: the customer's setting on the day the
          // invoice is issued is the one it was sent in (ADR-054).
          const languages = await documentLanguages(
            tx,
            organizationId,
            invoice.partnerId,
          );

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
              ...languages,
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
            ...partiesOf(invoice),
            ...languagesOf(invoice),
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
