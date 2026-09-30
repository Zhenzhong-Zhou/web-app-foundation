import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { invoices } from '../../database/schema';

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

  if (!invoice) throw new NotFoundException('No such invoice');

  if (invoice.status !== 'draft') {
    throw new ConflictException(
      `This invoice is ${invoice.status} — it cannot be changed. Void it and issue a new one`,
    );
  }

  return invoice;
}
