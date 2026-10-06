import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import type { Transaction } from '../../database/database.module';
import {
  creditNoteLines,
  creditNotes,
  creditNoteTaxes,
  invoices,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { computeCredit } from './credit-amounts';
import { takeNumber } from './document-numbers';
import type {
  CreditInvoiceDto,
  PreviewCreditDto,
} from './dto/credit-invoice.dto';
import { languagesOf, partiesOf, stored } from './issued-invoice';

type Invoice = typeof invoices.$inferSelect;

/**
 * Credit notes against part of an invoice (ADR-047) — for goods that came
 * back under an RMA, and for credits without goods: a price correction,
 * goodwill, a debt that will not be collected. A void, the whole invoice at
 * once, is InvoiceIssuingService's. The figures are computed in
 * credit-amounts.ts.
 *
 * What is credited is the person's choice, within caps that make a double
 * credit impossible:
 *
 * - per invoice line, by value: every credit's net against it, together,
 *   never exceeds what it billed. By value, not quantity, because a credit
 *   at a lowered price breaks a quantity cap;
 * - per tax component, by value: never more than the invoice charged;
 * - per RMA line, by quantity: never more than it authorized.
 *
 * Preview and issue run the same checks and the same calculation, so the
 * figures a person confirmed are the figures that are stored.
 */
@Injectable()
export class CreditNotesService {
  private readonly logger = new Logger(CreditNotesService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  /** The figures a credit would have, refusing what issuing would refuse. */
  async preview(invoiceId: string, input: PreviewCreditDto) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const invoice = await this.loadCreditable(
        tx,
        organizationId,
        invoiceId,
        false,
      );

      return computeCredit(tx, organizationId, invoice, input.lines);
    });
  }

  /**
   * Issues a credit note, numbered from its own series, under the invoice's
   * lock — the lock voiding takes too, so a credit and a void, or two
   * credits, never read the same "already credited" figure.
   */
  async issue(invoiceId: string, input: CreditInvoiceDto, actorId: string) {
    const issued = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const invoice = await this.loadCreditable(
          tx,
          organizationId,
          invoiceId,
          true,
        );

        const issuedOn = stored(invoice.invoiceDate, 'invoice date');

        // Calendar days as YYYY-MM-DD compare correctly as strings.
        if (input.creditDate < issuedOn) {
          throw new BadRequestException(
            t(
              {
                id: 'invoices.creditNoteDatedBefore',
                defaultMessage:
                  'A credit note cannot be dated before the invoice it credits ({issuedOn})',
              },
              { issuedOn },
            ),
          );
        }

        const amounts = await computeCredit(
          tx,
          organizationId,
          invoice,
          input.lines,
          true,
        );

        // After every refusal, so a refused credit leaves no gap.
        const number = await takeNumber(tx, organizationId, 'credit_note');

        const [creditNote] = await tx
          .insert(creditNotes)
          .values({
            organizationId,
            invoiceId: invoice.id,
            partnerId: invoice.partnerId,
            number,
            currency: invoice.currency,
            creditDate: input.creditDate,
            reason: input.reason,
            isVoid: false,
            subtotal: amounts.subtotal,
            taxTotal: amounts.taxTotal,
            total: amounts.total,
            ...partiesOf(invoice),
            ...languagesOf(invoice),
            createdBy: actorId,
          })
          .returning();

        await tx.insert(creditNoteLines).values(
          amounts.lines.map((line) => ({
            organizationId,
            creditNoteId: creditNote.id,
            invoiceLineId: line.invoiceLineId,
            returnAuthorizationLineId: line.returnAuthorizationLineId,
            sku: line.sku,
            description: line.description,
            secondDescription: line.secondDescription,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            taxCodeName: line.taxCodeName,
            netAmount: line.netAmount,
          })),
        );

        if (amounts.taxes.length > 0) {
          await tx.insert(creditNoteTaxes).values(
            amounts.taxes.map((tax) => ({
              organizationId,
              creditNoteId: creditNote.id,
              name: tax.name,
              rate: tax.rate,
              taxableAmount: tax.taxableAmount,
              amount: tax.amount,
            })),
          );
        }

        // For History: which invoice, and how much. The reason stays on the
        // document (ADR-018).
        recordContext({ invoice: invoice.number, total: amounts.total });

        return creditNote;
      },
    );

    this.logger.log(
      `Credit note ${issued.number} issued against invoice ${issued.invoiceId}`,
    );
    return issued;
  }

  // ---------------------------------------------------------------------------

  /**
   * An issued invoice of this tenant. A draft owes nothing yet; a voided
   * one was credited in full already. Locked when issuing.
   */
  private async loadCreditable(
    tx: Transaction,
    organizationId: string,
    invoiceId: string,
    lock: boolean,
  ): Promise<Invoice> {
    const query = tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.id, invoiceId),
        ),
      );

    const [invoice] = lock ? await query.for('update') : await query;

    if (!invoice)
      throw new NotFoundException(
        t({ id: 'invoices.suchInvoice', defaultMessage: 'No such invoice' }),
      );

    if (invoice.status === 'draft') {
      throw new ConflictException(
        t({
          id: 'invoices.draftOwesNothingYet',
          defaultMessage:
            'A draft owes nothing yet, so nothing on it can be credited — edit it instead',
        }),
      );
    }

    if (invoice.status === 'voided') {
      throw new ConflictException(
        t(
          {
            id: 'invoices.numberWasVoidedWas',
            defaultMessage:
              '{number} was voided — it was credited in full already',
          },
          { number: invoice.number },
        ),
      );
    }

    return invoice;
  }
}
