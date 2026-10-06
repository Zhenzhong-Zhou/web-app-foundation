import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { invoices } from '../../database/schema';
import { t } from '../../i18n/translate';

/**
 * The invoice, locked, and only if it is still a draft. Anything past
 * draft is corrected by a credit note and a new invoice, never an edit.
 */
export async function lockDraft(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
) {
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

  if (!invoice)
    throw new NotFoundException(
      t({ id: 'invoices.suchInvoice', defaultMessage: 'No such invoice' }),
    );

  if (invoice.status !== 'draft') {
    throw new ConflictException(
      t(
        {
          id: 'invoices.invoiceStatusChangedVoid',
          defaultMessage:
            'This invoice is {status} — it cannot be changed. Void it and issue a new one',
        },
        { status: invoice.status },
      ),
    );
  }

  return invoice;
}
